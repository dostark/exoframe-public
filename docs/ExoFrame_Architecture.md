# ExoFrame Architecture

**Version:** 1.8.0\
**Date:** December 3, 2025

This document provides a comprehensive architectural overview of ExoFrame components using Mermaid diagrams.

---

## System Architecture Overview

```mermaid
graph TB
    subgraph Actors["👥 Actors"]
        User[👤 User/Developer]
        Agent[🤖 AI Agent]
    end
    
    subgraph CLI["🖥️ CLI Layer"]
        Exoctl[exoctl CLI Entry]
        ReqCmd[Request Commands]
        PlanCmd[Plan Commands]
        ChangeCmd[Changeset Commands]
        GitCmd[Git Commands]
        DaemonCmd[Daemon Commands]
        PortalCmd[Portal Commands]
        BlueprintCmd[Blueprint Commands]
    end
    
    subgraph Core["⚙️ Core System"]
        Main[main.ts - Daemon]
        ReqWatch[Request Watcher<br/>Inbox/Requests]
        PlanWatch[Plan Watcher<br/>System/Active]
        ReqProc[Request Processor]
        PlanExec[Plan Executor<br/>5.12.1-5.12.2 ✅]
        AgentRun[Agent Runner]
        FlowEng[Flow Engine]
        ExecLoop[Execution Loop]
    end
    
    subgraph Services["🔧 Services"]
        ConfigSvc[Config Service]
        DBSvc[Database Service]
        GitSvc[Git Service]
        EventLog[Event Logger]
        ContextLoad[Context Loader]
        PlanWriter[Plan Writer]
        MissionRpt[Mission Reporter]
        PathRes[Path Resolver]
        ToolReg[Tool Registry]
        CtxCard[Context Card Generator]
    end
    
    subgraph Storage["💾 Storage"]
        DB[(SQLite DB<br/>journal.db)]
        FS[/File System<br/>~/ExoFrame/]
        Inbox[/Inbox/<br/>Requests & Plans/]
        Blueprint[/Blueprints/<br/>Agents & Flows/]
        Knowledge[/Knowledge/<br/>Context Cards/]
        Portals[/Portals/<br/>External Projects/]
        System[/System/<br/>Active & Archive/]
    end
    
    subgraph AI["🤖 AI Providers"]
        Factory[Provider Factory]
        Ollama[Ollama<br/>Local]
        Claude[Claude API<br/>Anthropic]
        GPT[OpenAI GPT<br/>Remote]
        Gemini[Google Gemini<br/>Remote]
        Mock[Mock Provider<br/>Testing]
    end
    
    %% User interactions
    User -->|CLI Commands| Exoctl
    User -->|Drop .md files| Inbox
    Agent -->|Read/Write| Portals
    
    %% CLI routing
    Exoctl --> ReqCmd
    Exoctl --> PlanCmd
    Exoctl --> ChangeCmd
    Exoctl --> GitCmd
    Exoctl --> DaemonCmd
    Exoctl --> PortalCmd
    Exoctl --> BlueprintCmd
    
    %% CLI to Services
    ReqCmd --> Inbox
    PlanCmd --> Inbox
    ChangeCmd --> GitSvc
    GitCmd --> GitSvc
    DaemonCmd --> Main
    PortalCmd --> ConfigSvc
    PortalCmd --> CtxCard
    BlueprintCmd --> Blueprint
    
    %% Core daemon flow
    Main --> ConfigSvc
    Main --> DBSvc
    Main --> Factory
    Main --> ReqWatch
    Main --> PlanWatch
    Main --> ReqProc
    Main --> PlanExec
    ReqWatch --> Inbox
    PlanWatch --> System
    ReqProc --> AgentRun
    PlanExec --> AgentRun
    AgentRun --> ExecLoop
    ExecLoop --> FlowEng
    
    %% Services integration
    AgentRun --> ContextLoad
    AgentRun --> PlanWriter
    AgentRun --> MissionRpt
    AgentRun --> EventLog
    ExecLoop --> ToolReg
    ExecLoop --> GitSvc
    ContextLoad --> Knowledge
    ContextLoad --> Portals
    PlanWriter --> Inbox
    EventLog --> DB
    GitSvc --> FS
    PathRes --> FS
    
    %% AI Provider routing
    Factory --> Ollama
    Factory --> Claude
    Factory --> GPT
    Factory --> Gemini
    Factory --> Mock
    AgentRun --> Factory
    
    %% Storage access
    ConfigSvc --> FS
    DBSvc --> DB
    ReqProc --> Blueprint
    Watcher --> System
    
    %% Styling
    classDef actor fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef cli fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef core fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef service fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef storage fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef ai fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    
    class User,Agent actor
    class Exoctl,ReqCmd,PlanCmd,ChangeCmd,GitCmd,DaemonCmd,PortalCmd,BlueprintCmd cli
    class Main,ReqWatch,PlanWatch,ReqProc,PlanExec,AgentRun,FlowEng,ExecLoop core
    class ConfigSvc,DBSvc,GitSvc,EventLog,ContextLoad,PlanWriter,MissionRpt,PathRes,ToolReg,CtxCard service
    class DB,FS,Inbox,Blueprint,Knowledge,Portals,System storage
    class Factory,Ollama,Claude,GPT,Gemini,Mock ai
```

---

## Request Processing Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as exoctl CLI
    participant I as Inbox/Requests
    participant W as File Watcher
    participant RP as Request Processor
    participant AR as Agent Runner
    participant AI as AI Provider
    participant P as Inbox/Plans
    participant DB as Activity Journal
    
    U->>CLI: exoctl request "Fix bug"
    CLI->>I: Create request-{uuid}.md
    CLI->>DB: Log request.created
    CLI-->>U: Request created ✓
    
    W->>I: Detect new file
    W->>RP: Trigger processing
    RP->>I: Read request.md
    RP->>AR: Load blueprint
    AR->>AI: Generate plan
    AI-->>AR: Plan response
    AR->>P: Write plan-{uuid}.md
    AR->>DB: Log plan.generated
    P-->>U: Ready for review
    
    U->>CLI: exoctl plan list
    CLI->>P: Read plans
    CLI-->>U: Show pending plans
    
    U->>CLI: exoctl plan approve {uuid}
    CLI->>P: Update plan status
    CLI->>DB: Log plan.approved
    CLI-->>U: Approved ✓
```

---

## Plan Execution Flow (Step 5.12)

**Architecture Change:** LLM agents now have direct portal access through scoped tools instead of ExoFrame parsing responses.

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as exoctl CLI
    participant Plans as Inbox/Plans
    participant Active as System/Active
    participant W as Plan Watcher
    participant Detect as Detection (5.12.1)
    participant Parse as Parsing (5.12.2)
    participant Exec as Agent Executor (5.12.3)
    participant Agent as LLM Agent<br/>(with scoped tools)
    participant Portal as Portal Repository
    participant CS as Changeset Registry
    participant DB as Activity Journal
    
    U->>CLI: exoctl plan approve {uuid}
    CLI->>Plans: Read plan-{uuid}.md
    CLI->>Active: Move to System/Active/
    CLI->>DB: Log plan.approved
    CLI-->>U: Plan approved ✓
    
    Note over W: File Watcher monitors<br/>System/Active/
    W->>Active: Detect _plan.md file
    W->>Detect: Trigger detection
    
    Detect->>Active: Read plan file
    Detect->>Detect: Parse YAML frontmatter
    Detect->>Detect: Validate trace_id
    Detect->>DB: Log plan.detected
    Detect->>DB: Log plan.ready_for_execution
    
    Detect->>Parse: Pass plan content
    Parse->>Parse: Extract body after frontmatter
    Parse->>Parse: Extract steps (regex)
    Parse->>Parse: Validate step numbering
    Parse->>Parse: Validate step titles
    
    alt Parsing Success
        Parse->>DB: Log plan.parsed
        Parse->>Exec: Pass parsed plan + portal
        Exec->>Exec: Validate portal permissions
        Exec->>Exec: Create scoped tool registry
        Exec->>DB: Log plan.executing
        Exec->>Agent: Invoke with tools:<br/>read_file, write_file,<br/>git_create_branch, git_commit
        
        Agent->>Portal: read_file(path)
        Portal-->>Agent: File contents
        Agent->>DB: Log agent.tool.invoked
        
        Agent->>Portal: git_create_branch(feat/xyz)
        Portal-->>Agent: Branch created
        Agent->>DB: Log agent.git.branch_created
        
        Agent->>Portal: write_file(path, content)
        Portal-->>Agent: File written
        Agent->>DB: Log agent.tool.invoked
        
        Agent->>Portal: git_commit(message, files)
        Portal-->>Agent: Commit SHA
        Agent->>DB: Log agent.git.commit
        
        Agent->>Exec: report_completion({<br/>branch, commit_sha,<br/>files_changed, description})
        
        Exec->>CS: Register changeset
        CS->>DB: Record changeset
        CS->>DB: Log changeset.created
        Exec->>DB: Log plan.executed
        Exec-->>U: Changeset created ✓
        
    else Parsing Failed
        Parse->>DB: Log plan.parsing_failed
        Parse-->>U: Parsing error logged
    end
    
    alt Portal Access Denied
        Exec->>DB: Log portal.access_denied
        Exec-->>U: Permission error
    end
```

### Plan Execution Components

```mermaid
graph TB
    subgraph Detection["5.12.1 Detection ✅"]
        D1[File Watcher<br/>System/Active/]
        D2[Filter _plan.md files]
        D3[Parse YAML frontmatter]
        D4[Validate trace_id]
        D5[Log plan.detected]
    end
    
    subgraph Parsing["5.12.2 Parsing ✅"]
        P1[Extract body section]
        P2[Regex: ## Step N: Title]
        P3[Validate sequential numbering]
        P4[Validate non-empty titles]
        P5[Build step objects]
        P6[Log plan.parsed]
    end
    
    subgraph Orchestration["5.12.3 Agent Orchestration 📋"]
        O1[Validate portal permissions]
        O2[Create scoped tool registry]
        O3[Invoke LLM agent with tools]
        O4[Monitor agent actions]
        O5[Receive changeset details]
    end
    
    subgraph AgentTools["Agent Tools (Portal-Scoped)"]
        T1[read_file - Read files]
        T2[write_file - Write files]
        T3[list_directory - List dirs]
        T4[git_create_branch - Create branch]
        T5[git_commit - Commit changes]
        T6[git_status - Check status]
        T7[report_completion - Signal done]
    end
    
    subgraph Registry["5.12.4 Changeset Registry 📋"]
        R1[Register changeset record]
        R2[Store commit SHA]
        R3[Link to trace_id]
        R4[Set status = pending]
    end
    
    subgraph Status["5.12.5 Status Update 📋"]
        S1[Mark plan executed]
        S2[Move to Archive]
        S3[Log completion]
    end
    
    subgraph Error["5.12.6 Error Handling 📋"]
        E1[Catch agent errors]
        E2[Catch Git errors]
        E3[Log failures]
        E4[Preserve plan state]
    end
    
    D1 --> D2 --> D3 --> D4 --> D5
    D5 --> P1
    P1 --> P2 --> P3 --> P4 --> P5 --> P6
    P6 --> G1
    G1 --> G2 --> G3 --> G4
    G4 --> C1
    C1 --> C2 --> C3 --> C4
    C4 --> S1
    S1 --> S2 --> S3
    
    G2 -.error.-> E1
    C2 -.error.-> E2
    E1 --> E3 --> E4
    E2 --> E3
    
    classDef implemented fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    classDef planned fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef error fill:#ffcdd2,stroke:#c62828,stroke-width:2px
    
    class D1,D2,D3,D4,D5,P1,P2,P3,P4,P5,P6 implemented
    class G1,G2,G3,G4,C1,C2,C3,C4,S1,S2,S3 planned
    class E1,E2,E3,E4 error
```

### Plan File Structure

```mermaid
graph TB
    subgraph PlanFile["_plan.md Structure"]
        FM[YAML Frontmatter<br/>---<br/>trace_id: uuid<br/>request_id: uuid<br/>agent: string<br/>status: approved<br/>---]
        Body[Markdown Body<br/># Plan Title<br/>Description]
        Step1[## Step 1: Title<br/>Content and tasks]
        Step2[## Step 2: Title<br/>Content and tasks]
        StepN[## Step N: Title<br/>Content and tasks]
    end
    
    subgraph Parsed["Parsed Structure"]
        Context[Context Object<br/>{trace_id, request_id,<br/>agent, status}]
        Steps[Steps Array<br/>[{number, title, content}]]
    end
    
    FM --> Context
    Body --> Context
    Step1 --> Steps
    Step2 --> Steps
    StepN --> Steps
    
    Context --> Execution[Plan Executor]
    Steps --> Execution
    
    classDef file fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef parsed fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    classDef exec fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    
    class FM,Body,Step1,Step2,StepN file
    class Context,Steps parsed
    class Execution exec
```

### Activity Logging Events

**Detection Events:**

- `plan.detected` - Plan file found in System/Active
- `plan.ready_for_execution` - Valid plan parsed, ready for execution
- `plan.invalid_frontmatter` - YAML parsing failed
- `plan.missing_trace_id` - Required trace_id field not found
- `plan.detection_failed` - Unexpected error during detection

**Parsing Events:**

- `plan.parsed` - Plan successfully parsed with step count
- `plan.parsing_failed` - Missing body, no steps, or empty titles
- `plan.non_sequential_steps` - Warning for gaps in step numbering

---

## CLI Commands Architecture

```mermaid
graph LR
    subgraph Entry["Entry Point"]
        Exoctl[exoctl.ts<br/>Main CLI]
    end
    
    subgraph Commands["Command Groups"]
        Base[BaseCommand<br/>Shared logic]
        Req[RequestCommands<br/>Create requests]
        Plan[PlanCommands<br/>Review plans]
        Change[ChangesetCommands<br/>Review code]
        Git[GitCommands<br/>Git operations]
        Daemon[DaemonCommands<br/>Daemon control]
        Portal[PortalCommands<br/>External projects]
        Blueprint[BlueprintCommands<br/>Agent templates]
    end
    
    subgraph Context["Shared Context"]
        Ctx[CommandContext<br/>config + db]
    end
    
    Exoctl --> Req
    Exoctl --> Plan
    Exoctl --> Change
    Exoctl --> Git
    Exoctl --> Daemon
    Exoctl --> Portal
    Exoctl --> Blueprint
    
    Req -.extends.-> Base
    Plan -.extends.-> Base
    Change -.extends.-> Base
    Git -.extends.-> Base
    Daemon -.extends.-> Base
    Portal -.extends.-> Base
    Blueprint -.extends.-> Base
    
    Base --> Ctx
    
    classDef entry fill:#bbdefb,stroke:#1976d2,stroke-width:2px
    classDef cmd fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    classDef ctx fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    
    class Exoctl entry
    class Base,Req,Plan,Change,Git,Daemon,Portal,Blueprint cmd
    class Ctx ctx
```

---

## AI Provider Architecture

```mermaid
graph TB
    subgraph Factory["Provider Factory"]
        PF[ProviderFactory.create]
        Info[getProviderInfo]
    end
    
    subgraph Config["Configuration"]
        Cfg[exo.config.toml<br/>ai.provider<br/>ai.model]
    end
    
    subgraph Providers["LLM Providers"]
        Ollama[OllamaProvider<br/>localhost:11434]
        Claude[ClaudeProvider<br/>api.anthropic.com]
        GPT[OpenAIProvider<br/>api.openai.com]
        Gemini[GeminiProvider<br/>generativelanguage.googleapis.com]
        Mock[MockLLMProvider<br/>Testing]
    end
    
    subgraph Interface["Provider Interface"]
        Gen[generateText<br/>generateStream]
    end
    
    Cfg --> PF
    PF --> Info
    PF -->|provider=ollama| Ollama
    PF -->|provider=anthropic| Claude
    PF -->|provider=openai| GPT
    PF -->|provider=google| Gemini
    PF -->|provider=mock| Mock
    
    Ollama -.implements.-> Gen
    Claude -.implements.-> Gen
    GPT -.implements.-> Gen
    Gemini -.implements.-> Gen
    Mock -.implements.-> Gen
    
    classDef factory fill:#e1bee7,stroke:#6a1b9a,stroke-width:2px
    classDef config fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef provider fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef interface fill:#b2dfdb,stroke:#00695c,stroke-width:2px
    
    class PF,Info factory
    class Cfg config
    class Ollama,Claude,GPT,Gemini,Mock provider
    class Gen interface
```

---

## Storage & Data Flow

```mermaid
graph TB
    subgraph FileSystem["File System (~/ExoFrame)"]
        Inbox["Inbox<br/>Requests & Plans"]
        Blueprint["Blueprints<br/>Agents & Flows"]
        Knowledge["Knowledge<br/>Context Cards"]
        Portals["Portals<br/>Symlinks"]
        System["System<br/>Active & Archive"]
    end
    
    subgraph Database["SQLite Database"]
        Journal[("journal.db<br/>Activity Journal")]
        Activities["activities table"]
        Schema["Schema migrations"]
    end
    
    subgraph Services["Services"]
        DB["DatabaseService"]
        Event["EventLogger"]
        Config["ConfigService"]
        Git["GitService"]
    end
    
    Inbox -->|Watch| Watcher["File Watcher"]
    Blueprint -->|Read| ReqProc["Request Processor"]
    Knowledge -->|Generate| CtxCard["Context Card Gen"]
    Portals -->|Access| AgentRun["Agent Runner"]
    System -->|Store| Archive["Archive Service"]
    
    Journal --> DB
    Activities --> Event
    Schema --> DB
    
    DB --> Event
    Config --> FileSystem
    Git --> FileSystem
    
    classDef storage fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef db fill:#b2dfdb,stroke:#00695c,stroke-width:2px
    classDef service fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    
    class Inbox,Blueprint,Knowledge,Portals,System storage
    class Journal,Activities,Schema db
    class DB,Event,Config,Git service
```

---

## Portal System Architecture

```mermaid
graph TB
    subgraph External["External Projects"]
        Proj1[~/Dev/MyWebsite]
        Proj2[~/Dev/MyAPI]
        Proj3[~/Work/Backend]
    end
    
    subgraph Portals["Portals Directory"]
        Link1[MyWebsite →]
        Link2[MyAPI →]
        Link3[Backend →]
    end
    
    subgraph Knowledge["Knowledge/Portals"]
        Card1[MyWebsite.md<br/>Context Card]
        Card2[MyAPI.md<br/>Context Card]
        Card3[Backend.md<br/>Context Card]
    end
    
    subgraph Config["Configuration"]
        TOML[exo.config.toml<br/>portals array]
        Deno[deno.json<br/>permissions]
    end
    
    subgraph CLI["Portal Management"]
        Add[exoctl portal add]
        List[exoctl portal list]
        Show[exoctl portal show]
        Remove[exoctl portal remove]
        Verify[exoctl portal verify]
        Refresh[exoctl portal refresh]
    end
    
    Proj1 -.symlink.-> Link1
    Proj2 -.symlink.-> Link2
    Proj3 -.symlink.-> Link3
    
    Link1 --> Card1
    Link2 --> Card2
    Link3 --> Card3
    
    Card1 --> TOML
    Card2 --> TOML
    Card3 --> TOML
    TOML --> Deno
    
    Add -->|Creates| Link1
    Add -->|Generates| Card1
    Add -->|Updates| TOML
    List -->|Reads| TOML
    Show -->|Reads| Card1
    Remove -->|Deletes| Link1
    Verify -->|Checks| Link1
    Refresh -->|Regenerates| Card1
    
    classDef external fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef portal fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef knowledge fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef config fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef cli fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    
    class Proj1,Proj2,Proj3 external
    class Link1,Link2,Link3 portal
    class Card1,Card2,Card3 knowledge
    class TOML,Deno config
    class Add,List,Show,Remove,Verify,Refresh cli
```

---

## Blueprint Management System

```mermaid
graph TB
    subgraph Templates["Built-in Templates"]
        Def[default<br/>Ollama llama3.2]
        Coder[coder<br/>Claude Sonnet]
        Reviewer[reviewer<br/>GPT-4]
        Architect[architect<br/>Claude Opus]
        Researcher[researcher<br/>GPT-4 Turbo]
        Mock[mock<br/>MockLLMProvider]
        Gemini[gemini<br/>Gemini 2.0 Flash]
    end
    
    subgraph Storage["Blueprints/Agents"]
        Files[/agent_id.md<br/>TOML frontmatter/]
        Validation[Zod Schema<br/>Validation]
    end
    
    subgraph CLI["Blueprint Commands"]
        Create[exoctl blueprint create]
        List[exoctl blueprint list]
        Show[exoctl blueprint show]
        Validate[exoctl blueprint validate]
        Edit[exoctl blueprint edit]
        Remove[exoctl blueprint remove]
    end
    
    subgraph Usage["Runtime Usage"]
        Request[exoctl request --agent]
        Processor[Request Processor]
        Runner[Agent Runner]
    end
    
    Def --> Create
    Coder --> Create
    Reviewer --> Create
    Architect --> Create
    Researcher --> Create
    Mock --> Create
    Gemini --> Create
    
    Create -->|Validates| Validation
    Create -->|Writes| Files
    List -->|Reads| Files
    Show -->|Reads| Files
    Validate -->|Checks| Validation
    Edit -->|$EDITOR| Files
    Remove -->|Deletes| Files
    
    Request --> Processor
    Processor -->|Loads| Files
    Processor --> Runner
    Runner -->|Executes| AI[AI Provider]
    
    classDef template fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef storage fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef cli fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    classDef usage fill:#e1bee7,stroke:#6a1b9a,stroke-width:2px
    
    class Def,Coder,Reviewer,Architect,Researcher,Mock,Gemini template
    class Files,Validation storage
    class Create,List,Show,Validate,Edit,Remove cli
    class Request,Processor,Runner,AI usage
```

---

## Daemon Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Stopped: Initial state
    
    Stopped --> Starting: exoctl daemon start
    Starting --> Running: PID written, watcher active
    Starting --> Failed: Startup error
    
    Running --> Stopping: exoctl daemon stop
    Running --> Restarting: exoctl daemon restart
    Running --> Crashed: Process died
    
    Stopping --> Stopped: SIGTERM successful
    Stopping --> ForceKill: Timeout (10s)
    ForceKill --> Stopped: SIGKILL sent
    
    Restarting --> Stopping: Stop phase
    Stopping --> Starting: Start phase
    
    Crashed --> Stopped: Cleanup PID file
    Failed --> Stopped: Cleanup resources
    
    Running --> Running: Process requests
    
    note right of Running
        File Watcher active
        Request Processor running
        Activity Journal logging
        AI Provider connected
    end note
    
    note right of Stopped
        PID file removed
        No watchers active
        Database closed
    end note
```

---

## Activity Journal Flow

```mermaid
graph LR
    subgraph Actors["Event Sources"]
        User[User Actions<br/>CLI commands]
        Daemon[Daemon Events<br/>System lifecycle]
        Agent[Agent Actions<br/>Processing]
        Git[Git Operations<br/>Commits]
    end
    
    subgraph Logger["Event Logger"]
        Log[log method]
        Info[info helper]
        Warn[warn helper]
        Error[error helper]
        Child[child logger]
    end
    
    subgraph Database["SQLite Journal"]
        Table[(activities table)]
        Cols[id, timestamp,<br/>trace_id, actor,<br/>action, target,<br/>payload, icon]
    end
    
    subgraph Query["Retrieval"]
        CLI[exoctl log tail]
        Trace[Filter by trace_id]
        Audit[Compliance audit]
    end
    
    User --> Log
    Daemon --> Info
    Agent --> Warn
    Git --> Error
    
    Log --> Table
    Info --> Table
    Warn --> Table
    Error --> Table
    Child --> Table
    
    Table --> CLI
    Table --> Trace
    Table --> Audit
    
    Cols -.schema.-> Table
    
    classDef source fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef logger fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef db fill:#b2dfdb,stroke:#00695c,stroke-width:2px
    classDef query fill:#fff3e0,stroke:#e65100,stroke-width:2px
    
    class User,Daemon,Agent,Git source
    class Log,Info,Warn,Error,Child logger
    class Table,Cols db
    class CLI,Trace,Audit query
```

---

## Key Design Principles

### 1. **Files as API**

- Request input: Markdown files in `Inbox/Requests`
- Plan output: Markdown files in `Inbox/Plans`
- Configuration: TOML with Zod validation
- Context: File system is source of truth

### 2. **Separation of Concerns**

- **CLI Layer**: Human interface (exoctl)
- **Core Layer**: Daemon orchestration (main.ts, watcher)
- **Service Layer**: Business logic (processors, runners)
- **Storage Layer**: SQLite + file system

### 3. **Auditability**

- Every action logged to Activity Journal
- Trace ID links: request → plan → changeset → commit
- Git commit footers with `Exo-Trace` metadata
- Immutable event stream for compliance

### 4. **Multi-Provider Support**

- Local-first: Ollama (no cloud required)
- Cloud options: Claude, GPT, Gemini
- Mock provider for testing
- Provider factory pattern for extensibility

### 5. **Portal System**

- Symlink-based external project access
- Context cards for agent understanding
- Scoped permissions (Deno security model)
- Multi-project refactoring support

---

## Component Responsibilities

| Component              | Responsibility                     | Key Files                           |
| ---------------------- | ---------------------------------- | ----------------------------------- |
| **CLI Layer**          | Human interface for system control | `src/cli/*.ts`                      |
| **Daemon**             | Background orchestration engine    | `src/main.ts`                       |
| **Request Watcher**    | Detect new requests in Inbox       | `src/services/watcher.ts`           |
| **Plan Watcher**       | Detect approved plans (5.12.1)     | `src/services/watcher.ts`           |
| **Request Processor**  | Parse requests, generate plans     | `src/services/request_processor.ts` |
| **Plan Executor**      | Execute approved plans (5.12)      | `src/main.ts` (in-progress)         |
| **Agent Runner**       | Execute agent logic with LLM       | `src/services/agent_runner.ts`      |
| **Event Logger**       | Write to Activity Journal          | `src/services/event_logger.ts`      |
| **Config Service**     | Load and validate exo.config.toml  | `src/config/service.ts`             |
| **Database Service**   | SQLite journal.db operations       | `src/services/db.ts`                |
| **Git Service**        | Git operations with trace metadata | `src/services/git_service.ts`       |
| **Provider Factory**   | Create LLM provider instances      | `src/ai/provider_factory.ts`        |
| **Context Loader**     | Load context for agent execution   | `src/services/context_loader.ts`    |
| **Portal Commands**    | Manage external project access     | `src/cli/portal_commands.ts`        |
| **Blueprint Commands** | Manage agent templates             | `src/cli/blueprint_commands.ts`     |

---

## Viewing This Document

### VS Code

- Built-in Mermaid preview (Markdown Preview Enhanced extension recommended)
- Right-click → "Open Preview" or press `Ctrl+Shift+V`

### GitHub/GitLab

- Native Mermaid rendering in markdown files

### Mermaid Live Editor

- https://mermaid.live/
- Copy/paste diagram code for editing

### Export Options

- PNG/SVG export via Mermaid Live Editor
- PDF export via VS Code extensions
- HTML with mermaid.js for web viewing

---

## Related Documentation

- **[Implementation Plan](ExoFrame_Implementation_Plan.md)** - Detailed development roadmap
- **[User Guide](ExoFrame_User_Guide.md)** - End-user documentation
- **[Technical Spec](ExoFrame_Technical_Spec.md)** - Deep technical details
- **[White Paper](ExoFrame_White_paper.md)** - Vision and philosophy
- **[Building with AI Agents](Building_with_AI_Agents.md)** - Development patterns
