/**
 * A standard JSON-RPC 2.0 identifier, fundamentally required for request/response correlation.
 */
export type JsonRpcId = string | number | null;

/**
 * Defines the strict structure of an incoming JSON-RPC 2.0 request.
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

/**
 * Encapsulates standard JSON-RPC 2.0 error layouts.
 */
export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Defines the strict structure of an outgoing JSON-RPC 2.0 response.
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

/**
 * Payload parameters strictly expected during the MCP `initialize` request handshake.
 */
export interface InitializeParams {
  protocolVersion: string;
  capabilities?: {
    tools?: {
      listChanged?: boolean;
    };
  };
  clientInfo?: {
    name?: string;
    version?: string;
  };
}
