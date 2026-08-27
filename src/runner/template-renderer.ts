import nunjucks from "nunjucks";
import path from "node:path";
import { fileURLToPath } from "node:url";

const templatesDirectory = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"templates",
);
const environment = nunjucks.configure(templatesDirectory, {
	autoescape: false,
	trimBlocks: true,
	lstripBlocks: true,
});

environment.addFilter("tojson", (value: unknown) =>
	JSON.stringify(value, null, 2),
);

export type TemplateContext = Record<string, unknown>;

export function renderTemplate(
	templatePath: string,
	context: TemplateContext,
): string {
	return environment.render(templatePath, context);
}
