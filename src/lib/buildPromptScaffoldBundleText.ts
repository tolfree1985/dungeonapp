type PromptScaffoldBundleInput = {
  preview: string;
  system: string;
  developer: string;
  user: string;
};

export function buildPromptScaffoldBundleText(input: PromptScaffoldBundleInput): string {
  const lines: string[] = [];
  lines.push("Prompt scaffold bundle");
  lines.push("");
  lines.push(`Preview: ${input.preview}`);
  lines.push("");
  lines.push("System:");
  lines.push(input.system);
  lines.push("");
  lines.push("Developer:");
  lines.push(input.developer);
  lines.push("");
  lines.push("User:");
  lines.push(input.user);
  return lines.join("\n");
}
