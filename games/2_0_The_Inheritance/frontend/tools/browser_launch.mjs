import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const windowsEdgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

export function launchTestBrowser() {
  const configuredPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const localEdgePath = process.platform === 'win32' && existsSync(windowsEdgePath)
    ? windowsEdgePath
    : undefined;
  const executablePath = configuredPath || localEdgePath;

  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
}
