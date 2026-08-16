// Minimal types for the extension

export interface ExtensionConfig {
  host: string;
  database: string | undefined;
  port: number;
  user: string;
  role?: string;
  readOnly: boolean;
  insiders: boolean;
  executeQueryMode?: string;
  toolsets?: string[];
  tools?: string[];
  logLevel: string;
  autoStart: boolean;
}
