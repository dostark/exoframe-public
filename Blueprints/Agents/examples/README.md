# ExoFrame Agent Examples

This directory contains comprehensive example agent blueprints demonstrating real-world patterns and capabilities for ExoFrame. These examples serve as templates and starting points for creating custom agents.

## 📁 Directory Structure

```
Blueprints/Agents/examples/
├── README.md                           # This file
├── code-reviewer.md                    # Code quality and security review
├── feature-developer.md                # End-to-end feature implementation
├── api-documenter.md                   # API documentation generation
├── security-auditor.md                 # Security vulnerability assessment
└── research-synthesizer.md             # Research analysis and synthesis

Blueprints/Agents/templates/
├── pipeline-agent.md.template          # Template for systematic processing
└── collaborative-agent.md.template     # Template for multi-agent workflows
```

## ⚠️ Prerequisites

These examples are **reference implementations**. They demonstrate best practices for system prompts, capabilities, and persona definitions.

**To use an example agent:**
1. **Copy it** to the parent directory (`Blueprints/Agents/`).
2. **Validate it** using `exoctl blueprint validate <filename>`.
3. **Ensure model availability:** Check that the `model` specified in the frontmatter is available in your environment (e.g., via Ollama).

## 🤖 Example Agents

### Development Agents

| Agent | Purpose | Capabilities |
|-------|---------|--------------|
| **code-reviewer** | Code quality, security, and best practices review | `read_file`, `write_file`, `list_directory` |
| **feature-developer** | Complete feature implementation lifecycle | `read_file`, `write_file`, `list_directory`, `git_*` |

### Content Agents

| Agent | Purpose | Capabilities |
|-------|---------|--------------|
| **api-documenter** | API documentation generation and maintenance | `read_file`, `list_directory` |

### Analysis Agents

| Agent | Purpose | Capabilities |
|-------|---------|--------------|
| **security-auditor** | Security vulnerability scanning and assessment | `read_file`, `list_directory`, `git_status` |
| **research-synthesizer** | Multi-source research analysis and synthesis | `read_file`, `write_file`, `list_directory` |

## 📋 Agent Blueprint Format

All agent blueprints use YAML frontmatter with the following structure:

```yaml
---
name: "agent-identifier"
model: "provider:model-name"
capabilities: ["tool1", "tool2", "tool3"]
---

# Agent Title

Agent description and usage examples...

## System Prompt

Detailed system prompt for the agent...

## Usage Examples

- Example use case 1
- Example use case 2

## Capabilities Required

- `tool1`: Description of why this tool is needed
- `tool2`: Description of why this tool is needed
```

## 🛠️ Available MCP Tools

Agents can use the following MCP (Model Context Protocol) tools:

### File Operations
- `read_file`: Read files from portals
- `write_file`: Write files to portals
- `list_directory`: List directory contents

### Git Operations
- `git_create_branch`: Create feature branches
- `git_commit`: Commit changes
- `git_status`: Check git status

## 🔐 Portal Permissions

Agents can only access portals that:
1. List the agent in `agents_allowed` (or use `"*"` for all agents)
2. Include required operations in the `operations` array
3. Allow access within portal boundaries (no `../` traversal)

## 📝 Creating Custom Agents

### Using Examples as Templates

1. Copy an example agent that matches your use case
2. Modify the `name`, `model`, and system prompt
3. Adjust capabilities based on required tools
4. Test with portal permissions

### Using Templates

For specialized patterns:

- **Pipeline Template**: For systematic, step-by-step processing
- **Collaborative Template**: For multi-agent workflow integration

Replace `{agent_name}`, `{model_name}`, `{specialty}`, etc. with your specific values.

## 🧪 Testing Agents

Each agent should be tested for:

1. **Blueprint Loading**: Validates against schema
2. **MCP Tool Access**: Proper permissions and error handling
3. **Portal Integration**: Works with configured portals
4. **Flow Compatibility**: Can be used in multi-agent flows

See `agents/tests/testing.md` for comprehensive testing guidelines.

## 🚀 Getting Started

1. Review the example agents that match your use case
2. Copy and customize the blueprint
3. Configure portal permissions
4. Test with `exoctl blueprint validate <agent-name>`
5. Use in flows or standalone execution

## 📚 Related Documentation

- `docs/ExoFrame_Implementation_Plan.md` - Step 6.10: Agent Examples
- `agents/source/exoframe.md` - Blueprint creation guidelines
- `agents/tests/testing.md` - Testing guidelines
- `Blueprints/Flows/examples/` - Flow examples that use these agents
