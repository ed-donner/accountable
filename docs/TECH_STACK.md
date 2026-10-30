This project will use the following high level technical stack:

1. Node.js / TypeScript for the frontend
2. Python 3.12 for the backend using uv

In the future this will be packaged into a Docker container, but for now it will run locally.

Testing will cover:

1. Unit tests for the frontend, using Vitest
2. Unit tests for the backend, using pytest
3. End-to-end tests of the whole app in a browser, using Playwright Test (`@playwright/test`) with the installed Google Chrome

One command will run all the tests and fail if any test fails.
