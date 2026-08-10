"""LangGraph macro lifecycle around AgentLoop (checkpointer per run)."""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.agent.loop import AgentLoop
from app.state import AgentRun, RunStatus


class GraphState(TypedDict, total=False):
    session_id: str
    run_id: str
    user_message: str
    status: str


_GRAPH = None
_CHECKPOINTER = MemorySaver()


async def _run_loop_node(state: GraphState) -> GraphState:
    """Macro node: drive AgentLoop until pause or done. Waits stay inside AgentLoop."""
    from app.state import STORE

    run = STORE.get_run(state["run_id"])
    if run is None:
        return {"status": "failed"}
    loop = AgentLoop(run)
    msg = state.get("user_message")
    await loop.run_until_pause_or_done(msg if msg else None)
    return {"status": run.status.value}


def build_agent_graph() -> Any:
    g: StateGraph = StateGraph(GraphState)
    g.add_node("agent_loop", _run_loop_node)
    g.add_edge(START, "agent_loop")
    g.add_edge("agent_loop", END)
    return g.compile(checkpointer=_CHECKPOINTER)


def get_agent_graph() -> Any:
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_agent_graph()
    return _GRAPH


async def start_run_via_graph(run: AgentRun, user_message: str) -> None:
    """Entry used by FastAPI — LangGraph wraps AgentLoop with MemorySaver thread_id=run_id."""
    graph = get_agent_graph()
    await graph.ainvoke(
        {
            "session_id": run.session_id,
            "run_id": run.run_id,
            "user_message": user_message,
            "status": RunStatus.RUNNING.value,
        },
        config={"configurable": {"thread_id": run.run_id}},
    )
