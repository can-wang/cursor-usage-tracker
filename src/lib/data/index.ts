const source = process.env.DATABASE_SOURCE ?? "sqlite";

if (source !== "sqlite") {
  throw new Error(
    `Unsupported DATABASE_SOURCE: "${source}". Supported values: sqlite. ` +
      `Postgres and Cloudflare D1 sources are planned — contributions welcome.`,
  );
}

export * from "./sqlite";
