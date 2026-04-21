import type { ProviderAdapter } from "./base";
import { claudeCodeAdapter } from "./claude-code";
import { codexAdapter } from "./codex";
import { cursorAdapter } from "./cursor";

export const providerRegistry: ProviderAdapter[] = [codexAdapter, claudeCodeAdapter, cursorAdapter];

export function getProviderById(id: string): ProviderAdapter | undefined {
  return providerRegistry.find((provider) => provider.id === id);
}

