import { Ripgrep } from "../file/ripgrep"

import { Instance } from "../project/instance"
import path from "path"
import os from "os"
import * as fs from "fs"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_ANTHROPIC_WITHOUT_TODO from "./prompt/qwen.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"

import PROMPT_CODEX from "./prompt/codex_header.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { PermissionNext } from "@/permission/next"
import { Skill } from "@/skill"
import { Global } from "../global/index.ts"

const PROMPT_CACHE = new Map<string, string>()

function getSystemPromptPaths(): string[] {
  return [
    process.env.OPENCODE_PROMPTS_DIR,
    path.join(Instance.directory, ".opencode", "prompt"),
    path.join(Global.Path.config, "prompt"),
  ].filter(Boolean) as string[]
}

export namespace SystemPrompt {
  export function instructions() {
    return PROMPT_CODEX.trim()
  }

  export function provider(model: Provider.Model) {
    const providerId = model.api.id
    const promptFile = getPromptFile(providerId)
    const customPrompt = findCustomPrompt(promptFile)
    if (customPrompt) return [customPrompt]

    if (providerId.includes("gpt-5")) return [PROMPT_CODEX]
    if (providerId.includes("gpt-") || providerId.includes("o1") || providerId.includes("o3"))
      return [PROMPT_BEAST]
    if (providerId.includes("gemini-")) return [PROMPT_GEMINI]
    if (providerId.includes("claude")) return [PROMPT_ANTHROPIC]
    if (providerId.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
    return [PROMPT_ANTHROPIC_WITHOUT_TODO]
  }

  function getPromptFile(modelId: string): string {
    if (modelId.includes("claude")) return "anthropic.txt"
    if (modelId.includes("gpt-5")) return "codex.txt"
    if (modelId.includes("gpt-") || modelId.includes("o1") || modelId.includes("o3"))
      return "beast.txt"
    if (modelId.includes("gemini-")) return "gemini.txt"
    if (modelId.includes("trinity")) return "trinity.txt"
    return "qwen.txt"
  }

  function findCustomPrompt(promptFile: string): string | undefined {
    const searchPaths = getSystemPromptPaths()
    for (const searchPath of searchPaths) {
      const fullPath = path.join(searchPath, promptFile)
      const cached = PROMPT_CACHE.get(fullPath)
      if (cached) return cached

      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8")
        PROMPT_CACHE.set(fullPath, content)
        return content
      }
    }
    return undefined
  }

  export async function environment(model: Provider.Model) {
    const project = Instance.project
    return [
      [
        `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
        `Here is some useful information about the environment you are running in:`,
        `<env>`,
        `  Working directory: ${Instance.directory}`,
        `  Workspace root folder: ${Instance.worktree}`,
        `  Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}`,
        `  Platform: ${process.platform}`,
        `  Today's date: ${new Date().toDateString()}`,
        `</env>`,
        `<directories>`,
        `  ${
          project.vcs === "git" && false
            ? await Ripgrep.tree({
                cwd: Instance.directory,
                limit: 50,
              })
            : ""
        }`,
        `</directories>`,
      ].join("\n"),
    ]
  }

  export async function skills(agent: Agent.Info) {
    if (PermissionNext.disabled(["skill"], agent.permission).has("skill")) return

    const list = await Skill.available(agent)

    return [
      "Skills provide specialized instructions and workflows for specific tasks.",
      "Use the skill tool to load a skill when a task matches its description.",
      // the agents seem to ingest the information about skills a bit better if we present a more verbose
      // version of them here and a less verbose version in tool description, rather than vice versa.
      Skill.fmt(list, { verbose: true }),
    ].join("\n")
  }
}
