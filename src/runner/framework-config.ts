export type OptionValue =
	| string
	| {
			value: string;
			overrides: {
				modelOverrides?: FrameworkConfig["modelOverrides"];
			};
	  };

interface FrameworkVersionOverride {
	/** Dependency versions to use for this framework version, keyed by package. */
	dependencies?: Record<string, string>;

	/** Values exposed only to the assessment template for this framework version. */
	templateOptions?: Record<string, string | number | boolean>;
}

export interface FrameworkConfig {
	/** Framework identifier, such as openai or openai-agents. */
	name: string;

	/** Runtime platform. */
	platform: "node" | "python" | "nextjs" | "cloudflare";

	/** Package dependencies installed in the generated environment. */
	dependencies: FrameworkDependency[];

	/** Framework versions included in the variant matrix. */
	versions: string[];

	/** Dependency and template overrides coupled to a specific framework version. */
	versionOverrides?: Record<string, FrameworkVersionOverride>;

	/** Sentry SDK versions included in the variant matrix. */
	sentryVersions: string[];

	/** Python execution mode. */
	executionMode?: "sync" | "async" | "both";

	/** Whether generated calls use streaming, blocking, or both. */
	streamingMode?: "streaming" | "blocking" | "both";

	/** Framework-specific option axes. Object values may override model expectations. */
	options?: Record<string, OptionValue[]>;

	/** Expected request and response model names. Values may contain `*` wildcards. */
	modelOverrides?: {
		request?: string;
		response?: string;
	};

	/** Minimum runtime version, such as Python 3.10. */
	minimumPlatformVersion?: string;

	/** Maximum assessment program runtime in milliseconds. */
	executionTimeoutMs?: number;
}

export interface FrameworkDependency {
	package: string;
	/** Registry version, `latest`, `framework`, or `sentry`. */
	version: string;
}

/** Fully resolved dependency configuration used by a platform runner. */
export interface ResolvedFramework {
	name: string;
	platform: FrameworkConfig["platform"];
	version: string;
	sentryVersion: string;
	dependencies: FrameworkDependency[];
	minimumPlatformVersion?: string;
}

export function resolveFrameworkDependencies(
	config: Pick<FrameworkConfig, "dependencies" | "versionOverrides">,
	frameworkVersion: string,
): FrameworkDependency[] {
	const overrides = config.versionOverrides?.[frameworkVersion]?.dependencies;
	return config.dependencies.map((dependency) => ({
		...dependency,
		version: overrides?.[dependency.package] ?? dependency.version,
	}));
}
