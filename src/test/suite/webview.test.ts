import * as assert from 'assert';
import * as vscode from 'vscode';
import { BeadsWebviewProvider } from '../../providers/beads/webview';

suite('Webview Test Suite', () => {
  test('Webview Provider Instantiation', async () => {
    const mockDataSource = {
      onDidChangeTreeData: new vscode.EventEmitter<void>().event,
      getVisibleBeads: () => [{ id: 'test-1', title: 'Test' } as any],
      getSortMode: () => 'id'
    };
    
    const provider = new BeadsWebviewProvider(vscode.Uri.parse('file:///'), mockDataSource);
    assert.ok(provider, 'Provider should be instantiated');
  });

  test('Extension Activation', async () => {
    const ext = vscode.extensions.getExtension('klabo.beady');
    assert.ok(ext, 'Extension should be present');
    await ext.activate();
    assert.ok(ext.isActive, 'Extension should be active');
  });
});
