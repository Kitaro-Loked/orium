# Orium Architecture

## Design Principles

1. **Universal**: Runs on any device, any OS, any runtime.
2. **Modular**: Use only what you need. Plug and play.
3. **Protocol-Agnostic**: Speak to any LLM through a single interface.
4. **Memory-First**: Intelligence requires memory. Hierarchical, persistent, retrievable.
5. **Tool-Native**: Tools are first-class citizens. MCP-compatible by default.

## Core Modules

### 1. Orchestrator (`src/core/orchestrator.ts`)
- Central task dispatcher
- Agent registration and lifecycle management
- Priority-based task scheduling
- Event-driven architecture

### 2. Adapters (`src/adapters/`)
- Abstract base class for all LLM providers
- Unified `complete()` and `stream()` APIs
- Health check and model enumeration
- Built-in: OpenAI, Claude, Gemini, Ollama

### 3. Memory (`src/memory/`)
- Three-tier hierarchy: Working → Short-term → Long-term
- Automatic promotion/demotion based on capacity and importance
- Pluggable retrieval (keyword, vector, hybrid)
- Cross-device sync ready

### 4. Tools (`src/tools/`)
- Schema-first tool definition
- Async handler registration
- Automatic MCP schema export
- Built-in tool library

### 5. Runtime (`src/runtime/`)
- Environment detection (Node/Bun/Deno/Browser/Worker/Edge)
- Capability matrix per platform
- Conditional feature loading

## Data Flow

```
User Input → UI Layer → Orchestrator → Agent Selection
                                              ↓
                                    [Tool Call Needed?]
                                         ↓ Yes
                                    Tool Registry → Execute → Return Result
                                         ↓ No
                                    Adapter → LLM API → Stream/Complete Response
                                              ↓
                                    Memory Store (Update & Retrieve)
                                              ↓
                                    Response → UI Layer → User
```

## Extension Points

- **Custom Agent**: Implement `Agent` interface, register with orchestrator
- **Custom Adapter**: Extend `ModelAdapter`, register with `AdapterRegistry`
- **Custom Tool**: Define schema + handler, register with `ToolRegistry`
- **Custom Memory Backend**: Implement storage interface for vector DB, etc.
