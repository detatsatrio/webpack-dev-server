"use strict";

const path = require("path");
const webpack = require("webpack");
const { test } = require("@playwright/test");
const { expect } = require("@playwright/test");
const { describe } = require("@playwright/test");
const { afterEach } = require("@playwright/test");
const { beforeEach } = require("@playwright/test");
const Server = require("../../lib/Server");
const config = require("../fixtures/client-config/webpack.config");
const port = require("../ports-map").app;

const staticDirectory = path.resolve(
  __dirname,
  "../fixtures/static-config/public",
);

const apps = [
  ["express", () => require("express")()],
  ["connect", () => require("connect")()],
  ["connect (async)", async () => require("express")()],
];

const servers = ["http", "https", "spdy"];

describe("app option", () => {
  for (const [appName, app] of apps) {
    for (const server of servers) {
      let compiler;
      let devServer;
      let pageErrors;
      let consoleMessages;

      describe(`should work using "${appName}" application and "${server}" server`, () => {
        beforeEach(async () => {
          compiler = webpack(config);

          devServer = new Server(
            {
              static: {
                directory: staticDirectory,
                watch: false,
              },
              app,
              server,
              port,
            },
            compiler,
          );

          await devServer.start();

          pageErrors = [];
          consoleMessages = [];
        });

        afterEach(async () => {
          await devServer.stop();
        });

        test("should handle GET request to index route (/)", async ({
          browser,
        }) => {
          const context = await browser.newContext({
            ignoreHTTPSErrors: true,
          });
          const page = await context.newPage();

          page
            .on("console", (message) => {
              consoleMessages.push(message);
            })
            .on("pageerror", (error) => {
              pageErrors.push(error);
            });

          const pageUrl =
            server === "https" || server === "spdy" || server === "http2"
              ? `https://127.0.0.1:${port}/`
              : `http://127.0.0.1:${port}/`;

          const response = await page.goto(pageUrl, {
            waitUntil: "networkidle0",
          });

          const HTTPVersion = await page.evaluate(
            () => performance.getEntries()[0].nextHopProtocol,
          );

          const isSpdy = server === "spdy";

          if (isSpdy) {
            expect(HTTPVersion).toEqual("h2");
          } else {
            expect(HTTPVersion).toEqual("http/1.1");
          }

          expect(JSON.stringify(response.status())).toMatchSnapshot();
          expect(JSON.stringify(await response.text())).toMatchSnapshot();
          expect(
            JSON.stringify(consoleMessages.map((message) => message.text())),
          ).toMatchSnapshot();
          expect(JSON.stringify(pageErrors)).toMatchSnapshot();
        });
      });
    }
  }
});