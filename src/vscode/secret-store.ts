import * as vscode from 'vscode';

export class SecretStore {
  constructor(private secrets: vscode.SecretStorage) {}

  async setPassword(password: string): Promise<void> {
    await this.secrets.store('firebirdMcp.password', password);
  }

  async getPassword(): Promise<string | undefined> {
    return this.secrets.get('firebirdMcp.password');
  }

  async deletePassword(): Promise<void> {
    await this.secrets.delete('firebirdMcp.password');
  }
}
