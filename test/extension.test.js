const assert = require('assert');
const vscode = require('vscode');

suite('Dev Focus Tracker Test Suite', () => {
    /** @type {import('vscode').Extension<{ getTimerState: () => { isRunning: boolean, isBreak: boolean, remainingSeconds: number, focusSessionStarted: boolean } }> | undefined} */
    let extension;

    suiteSetup(async () => {
        extension = vscode.extensions.all.find(
            ext => ext.packageJSON.name === 'dev-focus-tracker'
        );

        assert.ok(extension, 'Dev Focus Tracker extension should be available');

		if (!extension) {
			throw new Error('Dev Focus Tracker extension not found');
		}

		await extension.activate();

    });

    
	test('Extension should activate successfully', () => {
		assert.ok(extension, 'Extension should be available');
		assert.strictEqual(extension.isActive, true);
	});

    test('Should register timer and statistics commands', async () => {
        const commands = await vscode.commands.getCommands(true);

        const expectedCommands = [
            'dev-focus-tracker.startTimer',
            'dev-focus-tracker.pauseTimer',
            'dev-focus-tracker.resumeTimer',
            'dev-focus-tracker.stopTimer',
            'dev-focus-tracker.breakPause',
            'dev-focus-tracker.breakStop',
            'dev-focus-tracker.showDailyStats',
            'dev-focus-tracker.openSettings'
        ];

        for (const command of expectedCommands) {
            assert.ok(
                commands.includes(command),
                `Command should be registered: ${command}`
            );
        }
    });

    
    test('Focus timer should start, pause, resume and stop', async () => {
        assert.ok(extension, 'Extension should be available');

        if (!extension) {
            throw new Error('Extension not found');
        }

        await vscode.commands.executeCommand('dev-focus-tracker.stopTimer');

        // Start timer
        await vscode.commands.executeCommand('dev-focus-tracker.startTimer');

        let state = extension.exports.getTimerState();

        assert.strictEqual(state.isRunning, true);
        assert.strictEqual(state.focusSessionStarted, true);

        // Pause timer
        await vscode.commands.executeCommand('dev-focus-tracker.pauseTimer');

        state = extension.exports.getTimerState();

        assert.strictEqual(state.isRunning, false);
        assert.ok(state.remainingSeconds > 0);

        // Resume timer
        await vscode.commands.executeCommand('dev-focus-tracker.resumeTimer');

        state = extension.exports.getTimerState();

        assert.strictEqual(state.isRunning, true);

        // Stop timer
        await vscode.commands.executeCommand('dev-focus-tracker.stopTimer');

        state = extension.exports.getTimerState();

        assert.strictEqual(state.isRunning, false);
        assert.strictEqual(state.isBreak, false);
        assert.strictEqual(state.focusSessionStarted, false);
    });

});
