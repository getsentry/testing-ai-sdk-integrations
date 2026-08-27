export type Platform = "node" | "python" | "nextjs" | "cloudflare";

export function getFileExtension(platform: Platform): "py" | "js" {
	return platform === "python" ? "py" : "js";
}
