import { describe, expect, it } from "vitest";
import { decodeEditorText, editorLanguageForPath, encodeEditorText } from "./editorWiselyText";

describe("EditorWisely text formats", () => {
  it("round trips UTF-8 BOM and CRLF while exposing normalized editor text", () => {
    const original = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("one\r\ntwo\r\n")]);
    const decoded = decodeEditorText(original);
    expect(decoded).toEqual({ text: "one\ntwo\n", format: { bom: true, newline: "\r\n" } });
    expect(encodeEditorText(decoded.text, decoded.format)).toEqual(original);
  });
  it("rejects binary, invalid UTF-8, and oversized content", () => {
    expect(() => decodeEditorText(new Uint8Array([97, 0, 98]))).toThrow("binary_file");
    expect(() => decodeEditorText(new Uint8Array([97, 1, 98]))).toThrow("binary_file");
    expect(() => decodeEditorText(new Uint8Array([0xff]))).toThrow("unsupported_encoding");
    expect(() => decodeEditorText(new Uint8Array(2 * 1024 * 1024 + 1))).toThrow("file_too_large");
  });
  it("maps common source paths to editor languages", () => {
    expect(editorLanguageForPath("/tmp/main.tsx")).toBe("tsx");
    expect(editorLanguageForPath("Dockerfile")).toBe("dockerfile");
    expect(editorLanguageForPath("/tmp/deploy.sh")).toBe("shell");
    expect(editorLanguageForPath("/tmp/go.mod")).toBe("text");
    expect(editorLanguageForPath("/tmp/main.c")).toBe("c");
    expect(editorLanguageForPath("/tmp/main.cxx")).toBe("cpp");
    expect(editorLanguageForPath("/tmp/app.mjs")).toBe("javascript");
    expect(editorLanguageForPath("/tmp/app.cts")).toBe("typescript");
    expect(editorLanguageForPath("/tmp/theme.sass")).toBe("sass");
    expect(editorLanguageForPath("/tmp/run.fish")).toBe("shell");
    expect(editorLanguageForPath("/tmp/config.toml")).toBe("toml");
    expect(editorLanguageForPath("/tmp/Makefile")).toBe("makefile");
    expect(editorLanguageForPath("notes.unknown")).toBe("text");
    expect(editorLanguageForPath("Dockerfile.dev")).toBe("dockerfile");
    expect(editorLanguageForPath("FindOpenCV.cmake")).toBe("text");
  });
  it("opens Docker and CMake content as plain text regardless of filename", () => {
    expect(decodeEditorText(new TextEncoder().encode("FROM alpine:latest\nRUN echo ready\n")).text)
      .toBe("FROM alpine:latest\nRUN echo ready\n");
    expect(decodeEditorText(new TextEncoder().encode("cmake_minimum_required(VERSION 3.20)\n")).text)
      .toBe("cmake_minimum_required(VERSION 3.20)\n");
  });
});
