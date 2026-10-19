import test from "node:test";
import assert from "node:assert/strict";
import { loadMainModule } from "./mainTestHelper.js";

test("main.jsx cleans up anonymous styles, injects global styles, and renders root", async () => {
  const removedElements = [];
  const appendedElements = [];

  const mockAnonymousStyle = {
    textContent: "body { overflow: hidden; } box-sizing: border-box;",
    remove() {
      removedElements.push(this);
    },
  };

  const mockOtherStyle = {
    textContent: "p { color: red; }",
    remove() {
      removedElements.push(this);
    },
  };

  const mockHead = {
    querySelectorAll(selector) {
      if (selector === "style:not([id])") {
        return [mockAnonymousStyle, mockOtherStyle];
      }
      return [];
    },
    appendChild(element) {
      appendedElements.push(element);
      element.isConnected = true;
    },
  };

  const mockRoot = { id: "root" };
  let createdStyleElement = null;

  const mockDocument = {
    head: mockHead,
    getElementById(id) {
      if (id === "root") return mockRoot;
      if (id === "sketcher-global-styles") return null;
      return null;
    },
    createElement(tagName) {
      if (tagName === "style") {
        createdStyleElement = {
          id: "",
          textContent: "",
          isConnected: false,
        };
        return createdStyleElement;
      }
      return {};
    },
  };

  let rootContainerPassed = null;
  let renderedComponent = null;

  const mockReactDOM = {
    createRoot(container) {
      rootContainerPassed = container;
      return {
        render(component) {
          renderedComponent = component;
        },
      };
    },
  };

  await loadMainModule(mockDocument, mockReactDOM);

  // Verify anonymous reset style tag removal
  assert.equal(removedElements.length, 1);
  assert.equal(removedElements[0], mockAnonymousStyle);

  // Verify global style injection
  assert.ok(createdStyleElement);
  assert.equal(createdStyleElement.id, "sketcher-global-styles");
  assert.ok(createdStyleElement.textContent.includes("JetBrains+Mono"));
  assert.ok(createdStyleElement.textContent.includes("overflow: hidden;"));
  assert.equal(appendedElements.length, 1);
  assert.equal(appendedElements[0], createdStyleElement);

  // Verify React root creation and rendering
  assert.equal(rootContainerPassed, mockRoot);
  assert.ok(renderedComponent);
  assert.equal(typeof renderedComponent, "object");
  assert.equal(renderedComponent.type?.name || renderedComponent.type, Symbol.for("react.strict_mode"));
});

test("main.jsx reuses existing global style element if already present", async () => {
  const existingStyleElement = {
    id: "sketcher-global-styles",
    textContent: "",
    isConnected: true,
  };

  const mockHead = {
    querySelectorAll() {
      return [];
    },
    appendChild() {
      throw new Error("Should not append style if already connected");
    },
  };

  const mockRoot = { id: "root" };

  const mockDocument = {
    head: mockHead,
    getElementById(id) {
      if (id === "root") return mockRoot;
      if (id === "sketcher-global-styles") return existingStyleElement;
      return null;
    },
    createElement() {
      throw new Error("Should not create new style element if existing is found");
    },
  };

  const mockReactDOM = {
    createRoot() {
      return {
        render() {},
      };
    },
  };

  await loadMainModule(mockDocument, mockReactDOM);

  assert.equal(existingStyleElement.id, "sketcher-global-styles");
  assert.ok(existingStyleElement.textContent.includes("JetBrains+Mono"));
});
