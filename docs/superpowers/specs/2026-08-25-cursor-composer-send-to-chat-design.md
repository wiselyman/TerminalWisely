# Cursor-like AI composer + Send to chat

Date: 2026-08-25  
Status: approved  
Scope: AI Engineer composer layout + terminal/FS context menu → chat attachments.

## Goal

Make Ask/Plan/Agent and local attach feel like Cursor: mode dropdown + paperclip + preview chips above the input. Allow “Send to chat” from terminal selection, terminal path links, and LocalFs file tree (text + images only). Opening the AI panel and focusing the composer when sending from outside.

## Decisions

| Topic | Choice |
|-------|--------|
| Interaction mode UI | Bottom-left dropdown (current mode + ▾), not top segmented control |
| Local attach | Paperclip icon; menu: Local file / Terminal selection / Remote path… |
| Previews | Chip row above textarea (name + kind icon; image tiny thumb when base64 present) |
| SecurityMode / model | Stay in composer foot (left cluster) |
| Send to chat sources | (1) blank/selection menu (2) terminal path link file (3) LocalFs entry file |
| Closed panel | Auto-open AI panel + focus textarea |
| Allowed types | TEXT_EXTS + office (.pdf/.docx/.xlsx) + IMAGE_EXTS; reject others with toast |
| Directories | No Send to chat |

## Non-goals

- Cursor Auto model routing, Debug/Multitask modes, MCP, sidecar schema changes

## Success

Composer matches Cursor foot pattern; paperclip + chips work; right-click send opens panel, attaches, focuses input.
