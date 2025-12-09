import { VSBrowser, WebDriver } from 'vscode-extension-tester';
import * as assert from 'assert';

describe('UI Smoke Test', function () {
    this.timeout(100000);

    let driver: WebDriver;

    before(async function () {
        this.timeout(100000);
        driver = VSBrowser.instance.driver;
    });

    it('should load VS Code', async function () {
        const title = await driver.getTitle();
        assert.ok(title.includes('Visual Studio Code') || title.includes('Code'), 'Title should contain Visual Studio Code');
    });
});
