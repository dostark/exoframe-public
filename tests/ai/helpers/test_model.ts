export function getTestModel(): string {
  return Deno.env.get("EXO_TEST_LLM_MODEL") ?? "gpt-5-mini";
}

export function getTestModelDisplay(): string {
  // Upper-case for human-readable messages (e.g., GPT-5-MINI)
  return getTestModel().toUpperCase();
}
