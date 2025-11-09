var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// plugins/visual-editor/vite-plugin-react-inline-editor.js
var vite_plugin_react_inline_editor_exports = {};
__export(vite_plugin_react_inline_editor_exports, {
  default: () => inlineEditPlugin
});
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "file:///Users/emiliansusanu/Documents/Projects%20/KDPInsights/node_modules/@babel/parser/lib/index.js";
import traverseBabel from "file:///Users/emiliansusanu/Documents/Projects%20/KDPInsights/node_modules/@babel/traverse/lib/index.js";
import generate from "file:///Users/emiliansusanu/Documents/Projects%20/KDPInsights/node_modules/@babel/generator/lib/index.js";
import * as t from "file:///Users/emiliansusanu/Documents/Projects%20/KDPInsights/node_modules/@babel/types/lib/index.js";
import fs from "fs";
function parseEditId(editId) {
  const parts = editId.split(":");
  if (parts.length < 3) {
    return null;
  }
  const column = parseInt(parts.at(-1), 10);
  const line = parseInt(parts.at(-2), 10);
  const filePath = parts.slice(0, -2).join(":");
  if (!filePath || isNaN(line) || isNaN(column)) {
    return null;
  }
  return { filePath, line, column };
}
function checkTagNameEditable(openingElementNode, editableTagsList) {
  if (!openingElementNode || !openingElementNode.name)
    return false;
  const nameNode = openingElementNode.name;
  if (nameNode.type === "JSXIdentifier" && editableTagsList.includes(nameNode.name)) {
    return true;
  }
  if (nameNode.type === "JSXMemberExpression" && nameNode.property && nameNode.property.type === "JSXIdentifier" && editableTagsList.includes(nameNode.property.name)) {
    return true;
  }
  return false;
}
function validateImageSrc(openingNode) {
  if (!openingNode || !openingNode.name || openingNode.name.name !== "img") {
    return { isValid: true, reason: null };
  }
  const hasPropsSpread = openingNode.attributes.some(
    (attr) => t.isJSXSpreadAttribute(attr) && attr.argument && t.isIdentifier(attr.argument) && attr.argument.name === "props"
  );
  if (hasPropsSpread) {
    return { isValid: false, reason: "props-spread" };
  }
  const srcAttr = openingNode.attributes.find(
    (attr) => t.isJSXAttribute(attr) && attr.name && attr.name.name === "src"
  );
  if (!srcAttr) {
    return { isValid: false, reason: "missing-src" };
  }
  if (!t.isStringLiteral(srcAttr.value)) {
    return { isValid: false, reason: "dynamic-src" };
  }
  if (!srcAttr.value.value || srcAttr.value.value.trim() === "") {
    return { isValid: false, reason: "empty-src" };
  }
  return { isValid: true, reason: null };
}
function inlineEditPlugin() {
  return {
    name: "vite-inline-edit-plugin",
    enforce: "pre",
    transform(code, id) {
      if (!/\.(jsx|tsx)$/.test(id) || !id.startsWith(VITE_PROJECT_ROOT) || id.includes("node_modules")) {
        return null;
      }
      const relativeFilePath = path.relative(VITE_PROJECT_ROOT, id);
      const webRelativeFilePath = relativeFilePath.split(path.sep).join("/");
      try {
        const babelAst = parse(code, {
          sourceType: "module",
          plugins: ["jsx", "typescript"],
          errorRecovery: true
        });
        let attributesAdded = 0;
        traverseBabel.default(babelAst, {
          enter(path3) {
            if (path3.isJSXOpeningElement()) {
              const openingNode = path3.node;
              const elementNode = path3.parentPath.node;
              if (!openingNode.loc) {
                return;
              }
              const alreadyHasId = openingNode.attributes.some(
                (attr) => t.isJSXAttribute(attr) && attr.name.name === "data-edit-id"
              );
              if (alreadyHasId) {
                return;
              }
              const isCurrentElementEditable = checkTagNameEditable(openingNode, EDITABLE_HTML_TAGS);
              if (!isCurrentElementEditable) {
                return;
              }
              const imageValidation = validateImageSrc(openingNode);
              if (!imageValidation.isValid) {
                const disabledAttribute = t.jsxAttribute(
                  t.jsxIdentifier("data-edit-disabled"),
                  t.stringLiteral("true")
                );
                openingNode.attributes.push(disabledAttribute);
                attributesAdded++;
                return;
              }
              let shouldBeDisabledDueToChildren = false;
              if (t.isJSXElement(elementNode) && elementNode.children) {
                const hasPropsSpread = openingNode.attributes.some(
                  (attr) => t.isJSXSpreadAttribute(attr) && attr.argument && t.isIdentifier(attr.argument) && attr.argument.name === "props"
                );
                const hasDynamicChild = elementNode.children.some(
                  (child) => t.isJSXExpressionContainer(child)
                );
                if (hasDynamicChild || hasPropsSpread) {
                  shouldBeDisabledDueToChildren = true;
                }
              }
              if (!shouldBeDisabledDueToChildren && t.isJSXElement(elementNode) && elementNode.children) {
                const hasEditableJsxChild = elementNode.children.some((child) => {
                  if (t.isJSXElement(child)) {
                    return checkTagNameEditable(child.openingElement, EDITABLE_HTML_TAGS);
                  }
                  return false;
                });
                if (hasEditableJsxChild) {
                  shouldBeDisabledDueToChildren = true;
                }
              }
              if (shouldBeDisabledDueToChildren) {
                const disabledAttribute = t.jsxAttribute(
                  t.jsxIdentifier("data-edit-disabled"),
                  t.stringLiteral("true")
                );
                openingNode.attributes.push(disabledAttribute);
                attributesAdded++;
                return;
              }
              if (t.isJSXElement(elementNode) && elementNode.children && elementNode.children.length > 0) {
                let hasNonEditableJsxChild = false;
                for (const child of elementNode.children) {
                  if (t.isJSXElement(child)) {
                    if (!checkTagNameEditable(child.openingElement, EDITABLE_HTML_TAGS)) {
                      hasNonEditableJsxChild = true;
                      break;
                    }
                  }
                }
                if (hasNonEditableJsxChild) {
                  const disabledAttribute = t.jsxAttribute(
                    t.jsxIdentifier("data-edit-disabled"),
                    t.stringLiteral("true")
                  );
                  openingNode.attributes.push(disabledAttribute);
                  attributesAdded++;
                  return;
                }
              }
              let currentAncestorCandidatePath = path3.parentPath.parentPath;
              while (currentAncestorCandidatePath) {
                const ancestorJsxElementPath = currentAncestorCandidatePath.isJSXElement() ? currentAncestorCandidatePath : currentAncestorCandidatePath.findParent((p) => p.isJSXElement());
                if (!ancestorJsxElementPath) {
                  break;
                }
                if (checkTagNameEditable(ancestorJsxElementPath.node.openingElement, EDITABLE_HTML_TAGS)) {
                  return;
                }
                currentAncestorCandidatePath = ancestorJsxElementPath.parentPath;
              }
              const line = openingNode.loc.start.line;
              const column = openingNode.loc.start.column + 1;
              const editId = `${webRelativeFilePath}:${line}:${column}`;
              const idAttribute = t.jsxAttribute(
                t.jsxIdentifier("data-edit-id"),
                t.stringLiteral(editId)
              );
              openingNode.attributes.push(idAttribute);
              attributesAdded++;
            }
          }
        });
        if (attributesAdded > 0) {
          const generateFunction = generate.default || generate;
          const output = generateFunction(babelAst, {
            sourceMaps: true,
            sourceFileName: webRelativeFilePath
          }, code);
          return { code: output.code, map: output.map };
        }
        return null;
      } catch (error) {
        console.error(`[vite][visual-editor] Error transforming ${id}:`, error);
        return null;
      }
    },
    // Updates source code based on the changes received from the client
    configureServer(server) {
      server.middlewares.use("/api/apply-edit", async (req, res, next) => {
        if (req.method !== "POST")
          return next();
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          var _a;
          let absoluteFilePath = "";
          try {
            const { editId, newFullText } = JSON.parse(body);
            if (!editId || typeof newFullText === "undefined") {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Missing editId or newFullText" }));
            }
            const parsedId = parseEditId(editId);
            if (!parsedId) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Invalid editId format (filePath:line:column)" }));
            }
            const { filePath, line, column } = parsedId;
            absoluteFilePath = path.resolve(VITE_PROJECT_ROOT, filePath);
            if (filePath.includes("..") || !absoluteFilePath.startsWith(VITE_PROJECT_ROOT) || absoluteFilePath.includes("node_modules")) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Invalid path" }));
            }
            const originalContent = fs.readFileSync(absoluteFilePath, "utf-8");
            const babelAst = parse(originalContent, {
              sourceType: "module",
              plugins: ["jsx", "typescript"],
              errorRecovery: true
            });
            let targetNodePath = null;
            const visitor = {
              JSXOpeningElement(path3) {
                const node = path3.node;
                if (node.loc && node.loc.start.line === line && node.loc.start.column + 1 === column) {
                  targetNodePath = path3;
                  path3.stop();
                }
              }
            };
            traverseBabel.default(babelAst, visitor);
            if (!targetNodePath) {
              res.writeHead(404, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Target node not found by line/column", editId }));
            }
            const generateFunction = generate.default || generate;
            const targetOpeningElement = targetNodePath.node;
            const parentElementNode = (_a = targetNodePath.parentPath) == null ? void 0 : _a.node;
            const isImageElement = targetOpeningElement.name && targetOpeningElement.name.name === "img";
            let beforeCode = "";
            let afterCode = "";
            let modified = false;
            if (isImageElement) {
              const beforeOutput = generateFunction(targetOpeningElement, {});
              beforeCode = beforeOutput.code;
              const srcAttr = targetOpeningElement.attributes.find(
                (attr) => t.isJSXAttribute(attr) && attr.name && attr.name.name === "src"
              );
              if (srcAttr && t.isStringLiteral(srcAttr.value)) {
                srcAttr.value = t.stringLiteral(newFullText);
                modified = true;
                const afterOutput = generateFunction(targetOpeningElement, {});
                afterCode = afterOutput.code;
              }
            } else {
              if (parentElementNode && t.isJSXElement(parentElementNode)) {
                const beforeOutput = generateFunction(parentElementNode, {});
                beforeCode = beforeOutput.code;
                parentElementNode.children = [];
                if (newFullText && newFullText.trim() !== "") {
                  const newTextNode = t.jsxText(newFullText);
                  parentElementNode.children.push(newTextNode);
                }
                modified = true;
                const afterOutput = generateFunction(parentElementNode, {});
                afterCode = afterOutput.code;
              }
            }
            if (!modified) {
              res.writeHead(409, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Could not apply changes to AST." }));
            }
            const output = generateFunction(babelAst, {});
            const newContent = output.code;
            try {
              fs.writeFileSync(absoluteFilePath, newContent, "utf-8");
            } catch (writeError) {
              console.error(`[vite][visual-editor] Error during direct write for ${filePath}:`, writeError);
              throw writeError;
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: true,
              newFileContent: newContent,
              beforeCode,
              afterCode
            }));
          } catch (error) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error during edit application." }));
          }
        });
      });
    }
  };
}
var __vite_injected_original_import_meta_url, __filename, __dirname2, VITE_PROJECT_ROOT, EDITABLE_HTML_TAGS;
var init_vite_plugin_react_inline_editor = __esm({
  "plugins/visual-editor/vite-plugin-react-inline-editor.js"() {
    __vite_injected_original_import_meta_url = "file:///Users/emiliansusanu/Documents/Projects%20/KDPInsights/plugins/visual-editor/vite-plugin-react-inline-editor.js";
    __filename = fileURLToPath(__vite_injected_original_import_meta_url);
    __dirname2 = path.dirname(__filename);
    VITE_PROJECT_ROOT = path.resolve(__dirname2, "../..");
    EDITABLE_HTML_TAGS = ["a", "Button", "button", "p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "label", "Label", "img"];
  }
});

// plugins/visual-editor/visual-editor-config.js
var EDIT_MODE_STYLES;
var init_visual_editor_config = __esm({
  "plugins/visual-editor/visual-editor-config.js"() {
    EDIT_MODE_STYLES = `
  #root[data-edit-mode-enabled="true"] [data-edit-id] {
    cursor: pointer; 
    outline: 1px dashed #357DF9; 
    outline-offset: 2px;
    min-height: 1em;
  }
  #root[data-edit-mode-enabled="true"] {
    cursor: pointer;
  }
  #root[data-edit-mode-enabled="true"] [data-edit-id]:hover {
    background-color: #357DF933;
    outline-color: #357DF9; 
  }

  @keyframes fadeInTooltip {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  #inline-editor-disabled-tooltip {
    display: none; 
    opacity: 0; 
    position: absolute;
    background-color: #1D1E20;
    color: white;
    padding: 4px 8px;
    border-radius: 8px;
    z-index: 10001;
    font-size: 14px;
    border: 1px solid #3B3D4A;
    max-width: 184px;
    text-align: center;
  }

  #inline-editor-disabled-tooltip.tooltip-active {
    display: block;
    animation: fadeInTooltip 0.2s ease-out forwards;
  }
`;
  }
});

// plugins/visual-editor/vite-plugin-edit-mode.js
var vite_plugin_edit_mode_exports = {};
__export(vite_plugin_edit_mode_exports, {
  default: () => inlineEditDevPlugin
});
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
function inlineEditDevPlugin() {
  return {
    name: "vite:inline-edit-dev",
    apply: "serve",
    transformIndexHtml() {
      const scriptPath = resolve(__dirname3, "edit-mode-script.js");
      const scriptContent = readFileSync(scriptPath, "utf-8");
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children: scriptContent,
          injectTo: "body"
        },
        {
          tag: "style",
          children: EDIT_MODE_STYLES,
          injectTo: "head"
        }
      ];
    }
  };
}
var __vite_injected_original_import_meta_url2, __filename2, __dirname3;
var init_vite_plugin_edit_mode = __esm({
  "plugins/visual-editor/vite-plugin-edit-mode.js"() {
    init_visual_editor_config();
    __vite_injected_original_import_meta_url2 = "file:///Users/emiliansusanu/Documents/Projects%20/KDPInsights/plugins/visual-editor/vite-plugin-edit-mode.js";
    __filename2 = fileURLToPath2(__vite_injected_original_import_meta_url2);
    __dirname3 = resolve(__filename2, "..");
  }
});

// vite.config.js
import path2 from "node:path";
import react from "file:///Users/emiliansusanu/Documents/Projects%20/KDPInsights/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { createLogger, defineConfig } from "file:///Users/emiliansusanu/Documents/Projects%20/KDPInsights/node_modules/vite/dist/node/index.js";
var __vite_injected_original_dirname = "/Users/emiliansusanu/Documents/Projects /KDPInsights";
var isDev = process.env.NODE_ENV !== "production";
var inlineEditPlugin2;
var editModeDevPlugin;
if (isDev) {
  inlineEditPlugin2 = (await Promise.resolve().then(() => (init_vite_plugin_react_inline_editor(), vite_plugin_react_inline_editor_exports))).default;
  editModeDevPlugin = (await Promise.resolve().then(() => (init_vite_plugin_edit_mode(), vite_plugin_edit_mode_exports))).default;
}
var configHorizonsViteErrorHandler = `
const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			if (
				addedNode.nodeType === Node.ELEMENT_NODE &&
				(
					addedNode.tagName?.toLowerCase() === 'vite-error-overlay' ||
					addedNode.classList?.contains('backdrop')
				)
			) {
				handleViteOverlay(addedNode);
			}
		}
	}
});

observer.observe(document.documentElement, {
	childList: true,
	subtree: true
});

function handleViteOverlay(node) {
	if (!node.shadowRoot) {
		return;
	}

	const backdrop = node.shadowRoot.querySelector('.backdrop');

	if (backdrop) {
		const overlayHtml = backdrop.outerHTML;
		const parser = new DOMParser();
		const doc = parser.parseFromString(overlayHtml, 'text/html');
		const messageBodyElement = doc.querySelector('.message-body');
		const fileElement = doc.querySelector('.file');
		const messageText = messageBodyElement ? messageBodyElement.textContent.trim() : '';
		const fileText = fileElement ? fileElement.textContent.trim() : '';
		const error = messageText + (fileText ? ' File:' + fileText : '');

		window.parent.postMessage({
			type: 'horizons-vite-error',
			error,
		}, '*');
	}
}
`;
var configHorizonsRuntimeErrorHandler = `
window.onerror = (message, source, lineno, colno, errorObj) => {
	const errorDetails = errorObj ? JSON.stringify({
		name: errorObj.name,
		message: errorObj.message,
		stack: errorObj.stack,
		source,
		lineno,
		colno,
	}) : null;

	window.parent.postMessage({
		type: 'horizons-runtime-error',
		message,
		error: errorDetails
	}, '*');
};
`;
var configHorizonsConsoleErrroHandler = `
const originalConsoleError = console.error;
console.error = function(...args) {
	originalConsoleError.apply(console, args);

	let errorString = '';

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg instanceof Error) {
			errorString = arg.stack || \`\${arg.name}: \${arg.message}\`;
			break;
		}
	}

	if (!errorString) {
		errorString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
	}

	window.parent.postMessage({
		type: 'horizons-console-error',
		error: errorString
	}, '*');
};
`;
var configWindowFetchMonkeyPatch = `
const originalFetch = window.fetch;

window.fetch = function(...args) {
	const url = args[0] instanceof Request ? args[0].url : args[0];

	// Skip WebSocket URLs
	if (url.startsWith('ws:') || url.startsWith('wss:')) {
		return originalFetch.apply(this, args);
	}

	return originalFetch.apply(this, args)
		.then(async response => {
			const contentType = response.headers.get('Content-Type') || '';

			// Exclude HTML document responses
			const isDocumentResponse =
				contentType.includes('text/html') ||
				contentType.includes('application/xhtml+xml');

			if (!response.ok && !isDocumentResponse) {
					const responseClone = response.clone();
					const errorFromRes = await responseClone.text();
					const requestUrl = response.url;
					console.error(\`Fetch error from \${requestUrl}: \${errorFromRes}\`);
			}

			return response;
		})
		.catch(error => {
			if (!url.match(/.html?$/i)) {
				console.error(error);
			}

			throw error;
		});
};
`;
var addTransformIndexHtml = {
  name: "add-transform-index-html",
  transformIndexHtml(html) {
    return {
      html,
      tags: [
        {
          tag: "script",
          attrs: { type: "module" },
          children: configHorizonsRuntimeErrorHandler,
          injectTo: "head"
        },
        {
          tag: "script",
          attrs: { type: "module" },
          children: configHorizonsViteErrorHandler,
          injectTo: "head"
        },
        {
          tag: "script",
          attrs: { type: "module" },
          children: configHorizonsConsoleErrroHandler,
          injectTo: "head"
        },
        {
          tag: "script",
          attrs: { type: "module" },
          children: configWindowFetchMonkeyPatch,
          injectTo: "head"
        }
      ]
    };
  }
};
console.warn = () => {
};
var logger = createLogger();
var loggerError = logger.error;
logger.error = (msg, options) => {
  var _a;
  if ((_a = options == null ? void 0 : options.error) == null ? void 0 : _a.toString().includes("CssSyntaxError: [postcss]")) {
    return;
  }
  loggerError(msg, options);
};
var vite_config_default = defineConfig({
  customLogger: logger,
  plugins: [
    ...isDev ? [inlineEditPlugin2(), editModeDevPlugin()] : [],
    react(),
    ...isDev ? [addTransformIndexHtml] : []
  ],
  server: {
    cors: true,
    headers: {
      "Cross-Origin-Embedder-Policy": "credentialless"
    },
    allowedHosts: true
  },
  resolve: {
    extensions: [".jsx", ".js", ".tsx", ".ts", ".json"],
    alias: {
      "@": path2.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  build: {
    rollupOptions: {
      external: [
        "@babel/parser",
        "@babel/traverse",
        "@babel/generator",
        "@babel/types"
      ]
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsicGx1Z2lucy92aXN1YWwtZWRpdG9yL3ZpdGUtcGx1Z2luLXJlYWN0LWlubGluZS1lZGl0b3IuanMiLCAicGx1Z2lucy92aXN1YWwtZWRpdG9yL3Zpc3VhbC1lZGl0b3ItY29uZmlnLmpzIiwgInBsdWdpbnMvdmlzdWFsLWVkaXRvci92aXRlLXBsdWdpbi1lZGl0LW1vZGUuanMiLCAidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvZW1pbGlhbnN1c2FudS9Eb2N1bWVudHMvUHJvamVjdHMgL0tEUEluc2lnaHRzL3BsdWdpbnMvdmlzdWFsLWVkaXRvclwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2VtaWxpYW5zdXNhbnUvRG9jdW1lbnRzL1Byb2plY3RzIC9LRFBJbnNpZ2h0cy9wbHVnaW5zL3Zpc3VhbC1lZGl0b3Ivdml0ZS1wbHVnaW4tcmVhY3QtaW5saW5lLWVkaXRvci5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvZW1pbGlhbnN1c2FudS9Eb2N1bWVudHMvUHJvamVjdHMlMjAvS0RQSW5zaWdodHMvcGx1Z2lucy92aXN1YWwtZWRpdG9yL3ZpdGUtcGx1Z2luLXJlYWN0LWlubGluZS1lZGl0b3IuanNcIjtpbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tICd1cmwnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICdAYmFiZWwvcGFyc2VyJztcbmltcG9ydCB0cmF2ZXJzZUJhYmVsIGZyb20gJ0BiYWJlbC90cmF2ZXJzZSc7XG5pbXBvcnQgZ2VuZXJhdGUgZnJvbSAnQGJhYmVsL2dlbmVyYXRvcic7XG5pbXBvcnQgKiBhcyB0IGZyb20gJ0BiYWJlbC90eXBlcyc7XG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuXG5jb25zdCBfX2ZpbGVuYW1lID0gZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpO1xuY29uc3QgX19kaXJuYW1lID0gcGF0aC5kaXJuYW1lKF9fZmlsZW5hbWUpO1xuY29uc3QgVklURV9QUk9KRUNUX1JPT1QgPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4nKTtcbmNvbnN0IEVESVRBQkxFX0hUTUxfVEFHUyA9IFtcImFcIiwgXCJCdXR0b25cIiwgXCJidXR0b25cIiwgXCJwXCIsIFwic3BhblwiLCBcImgxXCIsIFwiaDJcIiwgXCJoM1wiLCBcImg0XCIsIFwiaDVcIiwgXCJoNlwiLCBcImxhYmVsXCIsIFwiTGFiZWxcIiwgXCJpbWdcIl07XG5cbmZ1bmN0aW9uIHBhcnNlRWRpdElkKGVkaXRJZCkge1xuICBjb25zdCBwYXJ0cyA9IGVkaXRJZC5zcGxpdCgnOicpO1xuXG4gIGlmIChwYXJ0cy5sZW5ndGggPCAzKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBjb2x1bW4gPSBwYXJzZUludChwYXJ0cy5hdCgtMSksIDEwKTtcbiAgY29uc3QgbGluZSA9IHBhcnNlSW50KHBhcnRzLmF0KC0yKSwgMTApO1xuICBjb25zdCBmaWxlUGF0aCA9IHBhcnRzLnNsaWNlKDAsIC0yKS5qb2luKCc6Jyk7XG5cbiAgaWYgKCFmaWxlUGF0aCB8fCBpc05hTihsaW5lKSB8fCBpc05hTihjb2x1bW4pKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICByZXR1cm4geyBmaWxlUGF0aCwgbGluZSwgY29sdW1uIH07XG59XG5cbmZ1bmN0aW9uIGNoZWNrVGFnTmFtZUVkaXRhYmxlKG9wZW5pbmdFbGVtZW50Tm9kZSwgZWRpdGFibGVUYWdzTGlzdCkge1xuICAgIGlmICghb3BlbmluZ0VsZW1lbnROb2RlIHx8ICFvcGVuaW5nRWxlbWVudE5vZGUubmFtZSkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IG5hbWVOb2RlID0gb3BlbmluZ0VsZW1lbnROb2RlLm5hbWU7XG5cbiAgICAvLyBDaGVjayAxOiBEaXJlY3QgbmFtZSAoZm9yIDxwPiwgPEJ1dHRvbj4pXG4gICAgaWYgKG5hbWVOb2RlLnR5cGUgPT09ICdKU1hJZGVudGlmaWVyJyAmJiBlZGl0YWJsZVRhZ3NMaXN0LmluY2x1ZGVzKG5hbWVOb2RlLm5hbWUpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIDI6IFByb3BlcnR5IG5hbWUgb2YgYSBtZW1iZXIgZXhwcmVzc2lvbiAoZm9yIDxtb3Rpb24uaDE+LCBjaGVjayBpZiBcImgxXCIgaXMgaW4gZWRpdGFibGVUYWdzTGlzdClcbiAgICBpZiAobmFtZU5vZGUudHlwZSA9PT0gJ0pTWE1lbWJlckV4cHJlc3Npb24nICYmIG5hbWVOb2RlLnByb3BlcnR5ICYmIG5hbWVOb2RlLnByb3BlcnR5LnR5cGUgPT09ICdKU1hJZGVudGlmaWVyJyAmJiBlZGl0YWJsZVRhZ3NMaXN0LmluY2x1ZGVzKG5hbWVOb2RlLnByb3BlcnR5Lm5hbWUpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVJbWFnZVNyYyhvcGVuaW5nTm9kZSkge1xuICAgIGlmICghb3BlbmluZ05vZGUgfHwgIW9wZW5pbmdOb2RlLm5hbWUgfHwgb3BlbmluZ05vZGUubmFtZS5uYW1lICE9PSAnaW1nJykge1xuICAgICAgICByZXR1cm4geyBpc1ZhbGlkOiB0cnVlLCByZWFzb246IG51bGwgfTsgLy8gTm90IGFuIGltYWdlLCBza2lwIHZhbGlkYXRpb25cbiAgICB9XG5cbiAgICBjb25zdCBoYXNQcm9wc1NwcmVhZCA9IG9wZW5pbmdOb2RlLmF0dHJpYnV0ZXMuc29tZShhdHRyID0+IFxuICAgICAgICB0LmlzSlNYU3ByZWFkQXR0cmlidXRlKGF0dHIpICYmIFxuICAgICAgICBhdHRyLmFyZ3VtZW50ICYmIFxuICAgICAgICB0LmlzSWRlbnRpZmllcihhdHRyLmFyZ3VtZW50KSAmJiBcbiAgICAgICAgYXR0ci5hcmd1bWVudC5uYW1lID09PSAncHJvcHMnXG4gICAgKTtcblxuICAgIGlmIChoYXNQcm9wc1NwcmVhZCkge1xuICAgICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgcmVhc29uOiAncHJvcHMtc3ByZWFkJyB9O1xuICAgIH1cblxuICAgIGNvbnN0IHNyY0F0dHIgPSBvcGVuaW5nTm9kZS5hdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBcbiAgICAgICAgdC5pc0pTWEF0dHJpYnV0ZShhdHRyKSAmJiBcbiAgICAgICAgYXR0ci5uYW1lICYmIFxuICAgICAgICBhdHRyLm5hbWUubmFtZSA9PT0gJ3NyYydcbiAgICApO1xuXG4gICAgaWYgKCFzcmNBdHRyKSB7XG4gICAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCByZWFzb246ICdtaXNzaW5nLXNyYycgfTtcbiAgICB9XG5cbiAgICBpZiAoIXQuaXNTdHJpbmdMaXRlcmFsKHNyY0F0dHIudmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCByZWFzb246ICdkeW5hbWljLXNyYycgfTtcbiAgICB9XG5cbiAgICBpZiAoIXNyY0F0dHIudmFsdWUudmFsdWUgfHwgc3JjQXR0ci52YWx1ZS52YWx1ZS50cmltKCkgPT09ICcnKSB7XG4gICAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCByZWFzb246ICdlbXB0eS1zcmMnIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgaXNWYWxpZDogdHJ1ZSwgcmVhc29uOiBudWxsIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGlubGluZUVkaXRQbHVnaW4oKSB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogJ3ZpdGUtaW5saW5lLWVkaXQtcGx1Z2luJyxcbiAgICBlbmZvcmNlOiAncHJlJyxcblxuICAgIHRyYW5zZm9ybShjb2RlLCBpZCkge1xuICAgICAgaWYgKCEvXFwuKGpzeHx0c3gpJC8udGVzdChpZCkgfHwgIWlkLnN0YXJ0c1dpdGgoVklURV9QUk9KRUNUX1JPT1QpIHx8IGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMnKSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVsYXRpdmVGaWxlUGF0aCA9IHBhdGgucmVsYXRpdmUoVklURV9QUk9KRUNUX1JPT1QsIGlkKTtcbiAgICAgIGNvbnN0IHdlYlJlbGF0aXZlRmlsZVBhdGggPSByZWxhdGl2ZUZpbGVQYXRoLnNwbGl0KHBhdGguc2VwKS5qb2luKCcvJyk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGJhYmVsQXN0ID0gcGFyc2UoY29kZSwge1xuICAgICAgICAgIHNvdXJjZVR5cGU6ICdtb2R1bGUnLFxuICAgICAgICAgIHBsdWdpbnM6IFsnanN4JywgJ3R5cGVzY3JpcHQnXSxcbiAgICAgICAgICBlcnJvclJlY292ZXJ5OiB0cnVlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBhdHRyaWJ1dGVzQWRkZWQgPSAwO1xuXG4gICAgICAgIHRyYXZlcnNlQmFiZWwuZGVmYXVsdChiYWJlbEFzdCwge1xuICAgICAgICAgIGVudGVyKHBhdGgpIHtcbiAgICAgICAgICAgIGlmIChwYXRoLmlzSlNYT3BlbmluZ0VsZW1lbnQoKSkge1xuICAgICAgICAgICAgICBjb25zdCBvcGVuaW5nTm9kZSA9IHBhdGgubm9kZTtcbiAgICAgICAgICAgICAgY29uc3QgZWxlbWVudE5vZGUgPSBwYXRoLnBhcmVudFBhdGgubm9kZTsgLy8gVGhlIEpTWEVsZW1lbnQgaXRzZWxmXG5cbiAgICAgICAgICAgICAgaWYgKCFvcGVuaW5nTm9kZS5sb2MpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBjb25zdCBhbHJlYWR5SGFzSWQgPSBvcGVuaW5nTm9kZS5hdHRyaWJ1dGVzLnNvbWUoXG4gICAgICAgICAgICAgICAgKGF0dHIpID0+IHQuaXNKU1hBdHRyaWJ1dGUoYXR0cikgJiYgYXR0ci5uYW1lLm5hbWUgPT09ICdkYXRhLWVkaXQtaWQnXG4gICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgaWYgKGFscmVhZHlIYXNJZCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vIENvbmRpdGlvbiAxOiBJcyB0aGUgY3VycmVudCBlbGVtZW50IHRhZyB0eXBlIGVkaXRhYmxlP1xuICAgICAgICAgICAgICBjb25zdCBpc0N1cnJlbnRFbGVtZW50RWRpdGFibGUgPSBjaGVja1RhZ05hbWVFZGl0YWJsZShvcGVuaW5nTm9kZSwgRURJVEFCTEVfSFRNTF9UQUdTKTtcbiAgICAgICAgICAgICAgaWYgKCFpc0N1cnJlbnRFbGVtZW50RWRpdGFibGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBjb25zdCBpbWFnZVZhbGlkYXRpb24gPSB2YWxpZGF0ZUltYWdlU3JjKG9wZW5pbmdOb2RlKTtcbiAgICAgICAgICAgICAgaWYgKCFpbWFnZVZhbGlkYXRpb24uaXNWYWxpZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRpc2FibGVkQXR0cmlidXRlID0gdC5qc3hBdHRyaWJ1dGUoXG4gICAgICAgICAgICAgICAgICB0LmpzeElkZW50aWZpZXIoJ2RhdGEtZWRpdC1kaXNhYmxlZCcpLFxuICAgICAgICAgICAgICAgICAgdC5zdHJpbmdMaXRlcmFsKCd0cnVlJylcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIG9wZW5pbmdOb2RlLmF0dHJpYnV0ZXMucHVzaChkaXNhYmxlZEF0dHJpYnV0ZSk7XG4gICAgICAgICAgICAgICAgYXR0cmlidXRlc0FkZGVkKys7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgbGV0IHNob3VsZEJlRGlzYWJsZWREdWVUb0NoaWxkcmVuID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgLy8gQ29uZGl0aW9uIDI6IERvZXMgdGhlIGVsZW1lbnQgaGF2ZSBkeW5hbWljIG9yIGVkaXRhYmxlIGNoaWxkcmVuXG4gICAgICAgICAgICAgIGlmICh0LmlzSlNYRWxlbWVudChlbGVtZW50Tm9kZSkgJiYgZWxlbWVudE5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBlbGVtZW50IGhhcyB7Li4ucHJvcHN9IHNwcmVhZCBhdHRyaWJ1dGUgLSBkaXNhYmxlIGVkaXRpbmcgaWYgaXQgZG9lc1xuICAgICAgICAgICAgICAgIGNvbnN0IGhhc1Byb3BzU3ByZWFkID0gb3BlbmluZ05vZGUuYXR0cmlidXRlcy5zb21lKGF0dHIgPT4gdC5pc0pTWFNwcmVhZEF0dHJpYnV0ZShhdHRyKVxuICAgICAgICAgICAgICAgICYmIGF0dHIuYXJndW1lbnRcbiAgICAgICAgICAgICAgICAmJiB0LmlzSWRlbnRpZmllcihhdHRyLmFyZ3VtZW50KVxuICAgICAgICAgICAgICAgICYmIGF0dHIuYXJndW1lbnQubmFtZSA9PT0gJ3Byb3BzJ1xuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBoYXNEeW5hbWljQ2hpbGQgPSBlbGVtZW50Tm9kZS5jaGlsZHJlbi5zb21lKGNoaWxkID0+XG4gICAgICAgICAgICAgICAgICB0LmlzSlNYRXhwcmVzc2lvbkNvbnRhaW5lcihjaGlsZClcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgaWYgKGhhc0R5bmFtaWNDaGlsZCB8fCBoYXNQcm9wc1NwcmVhZCkge1xuICAgICAgICAgICAgICAgICAgc2hvdWxkQmVEaXNhYmxlZER1ZVRvQ2hpbGRyZW4gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmICghc2hvdWxkQmVEaXNhYmxlZER1ZVRvQ2hpbGRyZW4gJiYgdC5pc0pTWEVsZW1lbnQoZWxlbWVudE5vZGUpICYmIGVsZW1lbnROb2RlLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaGFzRWRpdGFibGVKc3hDaGlsZCA9IGVsZW1lbnROb2RlLmNoaWxkcmVuLnNvbWUoY2hpbGQgPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKHQuaXNKU1hFbGVtZW50KGNoaWxkKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hlY2tUYWdOYW1lRWRpdGFibGUoY2hpbGQub3BlbmluZ0VsZW1lbnQsIEVESVRBQkxFX0hUTUxfVEFHUyk7XG4gICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGlmIChoYXNFZGl0YWJsZUpzeENoaWxkKSB7XG4gICAgICAgICAgICAgICAgICBzaG91bGRCZURpc2FibGVkRHVlVG9DaGlsZHJlbiA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKHNob3VsZEJlRGlzYWJsZWREdWVUb0NoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGlzYWJsZWRBdHRyaWJ1dGUgPSB0LmpzeEF0dHJpYnV0ZShcbiAgICAgICAgICAgICAgICAgIHQuanN4SWRlbnRpZmllcignZGF0YS1lZGl0LWRpc2FibGVkJyksXG4gICAgICAgICAgICAgICAgICB0LnN0cmluZ0xpdGVyYWwoJ3RydWUnKVxuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICBvcGVuaW5nTm9kZS5hdHRyaWJ1dGVzLnB1c2goZGlzYWJsZWRBdHRyaWJ1dGUpO1xuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZXNBZGRlZCsrO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vIENvbmRpdGlvbiAzOiBQYXJlbnQgaXMgbm9uLWVkaXRhYmxlIGlmIEFUIExFQVNUIE9ORSBjaGlsZCBKU1hFbGVtZW50IGlzIGEgbm9uLWVkaXRhYmxlIHR5cGUuXG4gICAgICAgICAgICAgIGlmICh0LmlzSlNYRWxlbWVudChlbGVtZW50Tm9kZSkgJiYgZWxlbWVudE5vZGUuY2hpbGRyZW4gJiYgZWxlbWVudE5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgbGV0IGhhc05vbkVkaXRhYmxlSnN4Q2hpbGQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgZWxlbWVudE5vZGUuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICBpZiAodC5pc0pTWEVsZW1lbnQoY2hpbGQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghY2hlY2tUYWdOYW1lRWRpdGFibGUoY2hpbGQub3BlbmluZ0VsZW1lbnQsIEVESVRBQkxFX0hUTUxfVEFHUykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc05vbkVkaXRhYmxlSnN4Q2hpbGQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBpZiAoaGFzTm9uRWRpdGFibGVKc3hDaGlsZCkge1xuICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc2FibGVkQXR0cmlidXRlID0gdC5qc3hBdHRyaWJ1dGUoXG4gICAgICAgICAgICAgICAgICAgICAgICB0LmpzeElkZW50aWZpZXIoJ2RhdGEtZWRpdC1kaXNhYmxlZCcpLFxuICAgICAgICAgICAgICAgICAgICAgICAgdC5zdHJpbmdMaXRlcmFsKFwidHJ1ZVwiKVxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgb3BlbmluZ05vZGUuYXR0cmlidXRlcy5wdXNoKGRpc2FibGVkQXR0cmlidXRlKTtcbiAgICAgICAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzQWRkZWQrKztcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBDb25kaXRpb24gNDogSXMgYW55IGFuY2VzdG9yIEpTWEVsZW1lbnQgYWxzbyBlZGl0YWJsZT9cbiAgICAgICAgICAgICAgbGV0IGN1cnJlbnRBbmNlc3RvckNhbmRpZGF0ZVBhdGggPSBwYXRoLnBhcmVudFBhdGgucGFyZW50UGF0aDtcbiAgICAgICAgICAgICAgd2hpbGUgKGN1cnJlbnRBbmNlc3RvckNhbmRpZGF0ZVBhdGgpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGFuY2VzdG9ySnN4RWxlbWVudFBhdGggPSBjdXJyZW50QW5jZXN0b3JDYW5kaWRhdGVQYXRoLmlzSlNYRWxlbWVudCgpXG4gICAgICAgICAgICAgICAgICAgICAgPyBjdXJyZW50QW5jZXN0b3JDYW5kaWRhdGVQYXRoXG4gICAgICAgICAgICAgICAgICAgICAgOiBjdXJyZW50QW5jZXN0b3JDYW5kaWRhdGVQYXRoLmZpbmRQYXJlbnQocCA9PiBwLmlzSlNYRWxlbWVudCgpKTtcblxuICAgICAgICAgICAgICAgICAgaWYgKCFhbmNlc3RvckpzeEVsZW1lbnRQYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgIGlmIChjaGVja1RhZ05hbWVFZGl0YWJsZShhbmNlc3RvckpzeEVsZW1lbnRQYXRoLm5vZGUub3BlbmluZ0VsZW1lbnQsIEVESVRBQkxFX0hUTUxfVEFHUykpIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBjdXJyZW50QW5jZXN0b3JDYW5kaWRhdGVQYXRoID0gYW5jZXN0b3JKc3hFbGVtZW50UGF0aC5wYXJlbnRQYXRoO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgY29uc3QgbGluZSA9IG9wZW5pbmdOb2RlLmxvYy5zdGFydC5saW5lO1xuICAgICAgICAgICAgICBjb25zdCBjb2x1bW4gPSBvcGVuaW5nTm9kZS5sb2Muc3RhcnQuY29sdW1uICsgMTtcbiAgICAgICAgICAgICAgY29uc3QgZWRpdElkID0gYCR7d2ViUmVsYXRpdmVGaWxlUGF0aH06JHtsaW5lfToke2NvbHVtbn1gO1xuXG4gICAgICAgICAgICAgIGNvbnN0IGlkQXR0cmlidXRlID0gdC5qc3hBdHRyaWJ1dGUoXG4gICAgICAgICAgICAgICAgdC5qc3hJZGVudGlmaWVyKCdkYXRhLWVkaXQtaWQnKSxcbiAgICAgICAgICAgICAgICB0LnN0cmluZ0xpdGVyYWwoZWRpdElkKVxuICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgIG9wZW5pbmdOb2RlLmF0dHJpYnV0ZXMucHVzaChpZEF0dHJpYnV0ZSk7XG4gICAgICAgICAgICAgIGF0dHJpYnV0ZXNBZGRlZCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGF0dHJpYnV0ZXNBZGRlZCA+IDApIHtcbiAgICAgICAgICBjb25zdCBnZW5lcmF0ZUZ1bmN0aW9uID0gZ2VuZXJhdGUuZGVmYXVsdCB8fCBnZW5lcmF0ZTtcbiAgICAgICAgICBjb25zdCBvdXRwdXQgPSBnZW5lcmF0ZUZ1bmN0aW9uKGJhYmVsQXN0LCB7XG4gICAgICAgICAgICBzb3VyY2VNYXBzOiB0cnVlLFxuICAgICAgICAgICAgc291cmNlRmlsZU5hbWU6IHdlYlJlbGF0aXZlRmlsZVBhdGhcbiAgICAgICAgICB9LCBjb2RlKTtcblxuICAgICAgICAgIHJldHVybiB7IGNvZGU6IG91dHB1dC5jb2RlLCBtYXA6IG91dHB1dC5tYXAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgW3ZpdGVdW3Zpc3VhbC1lZGl0b3JdIEVycm9yIHRyYW5zZm9ybWluZyAke2lkfTpgLCBlcnJvcik7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgIH0sXG5cblxuICAgIC8vIFVwZGF0ZXMgc291cmNlIGNvZGUgYmFzZWQgb24gdGhlIGNoYW5nZXMgcmVjZWl2ZWQgZnJvbSB0aGUgY2xpZW50XG4gICAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xuICAgICAgc2VydmVyLm1pZGRsZXdhcmVzLnVzZSgnL2FwaS9hcHBseS1lZGl0JywgYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gICAgICAgIGlmIChyZXEubWV0aG9kICE9PSAnUE9TVCcpIHJldHVybiBuZXh0KCk7XG5cbiAgICAgICAgbGV0IGJvZHkgPSAnJztcbiAgICAgICAgcmVxLm9uKCdkYXRhJywgY2h1bmsgPT4geyBib2R5ICs9IGNodW5rLnRvU3RyaW5nKCk7IH0pO1xuXG4gICAgICAgIHJlcS5vbignZW5kJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGxldCBhYnNvbHV0ZUZpbGVQYXRoID0gJyc7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZWRpdElkLCBuZXdGdWxsVGV4dCB9ID0gSlNPTi5wYXJzZShib2R5KTtcblxuICAgICAgICAgICAgaWYgKCFlZGl0SWQgfHwgdHlwZW9mIG5ld0Z1bGxUZXh0ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWlzc2luZyBlZGl0SWQgb3IgbmV3RnVsbFRleHQnIH0pKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcGFyc2VkSWQgPSBwYXJzZUVkaXRJZChlZGl0SWQpO1xuICAgICAgICAgICAgaWYgKCFwYXJzZWRJZCkge1xuICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW52YWxpZCBlZGl0SWQgZm9ybWF0IChmaWxlUGF0aDpsaW5lOmNvbHVtbiknIH0pKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgeyBmaWxlUGF0aCwgbGluZSwgY29sdW1uIH0gPSBwYXJzZWRJZDtcblxuICAgICAgICAgICAgYWJzb2x1dGVGaWxlUGF0aCA9IHBhdGgucmVzb2x2ZShWSVRFX1BST0pFQ1RfUk9PVCwgZmlsZVBhdGgpO1xuICAgICAgICAgICAgaWYgKGZpbGVQYXRoLmluY2x1ZGVzKCcuLicpIHx8ICFhYnNvbHV0ZUZpbGVQYXRoLnN0YXJ0c1dpdGgoVklURV9QUk9KRUNUX1JPT1QpIHx8IGFic29sdXRlRmlsZVBhdGguaW5jbHVkZXMoJ25vZGVfbW9kdWxlcycpKSB7XG4gICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgICAgICAgIHJldHVybiByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnZhbGlkIHBhdGgnIH0pKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGFic29sdXRlRmlsZVBhdGgsICd1dGYtOCcpO1xuXG4gICAgICAgICAgICBjb25zdCBiYWJlbEFzdCA9IHBhcnNlKG9yaWdpbmFsQ29udGVudCwge1xuICAgICAgICAgICAgICBzb3VyY2VUeXBlOiAnbW9kdWxlJyxcbiAgICAgICAgICAgICAgcGx1Z2luczogWydqc3gnLCAndHlwZXNjcmlwdCddLFxuICAgICAgICAgICAgICBlcnJvclJlY292ZXJ5OiB0cnVlXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbGV0IHRhcmdldE5vZGVQYXRoID0gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHZpc2l0b3IgPSB7XG4gICAgICAgICAgICAgIEpTWE9wZW5pbmdFbGVtZW50KHBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlID0gcGF0aC5ub2RlO1xuICAgICAgICAgICAgICAgIGlmIChub2RlLmxvYyAmJiBub2RlLmxvYy5zdGFydC5saW5lID09PSBsaW5lICYmIG5vZGUubG9jLnN0YXJ0LmNvbHVtbiArIDEgPT09IGNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgdGFyZ2V0Tm9kZVBhdGggPSBwYXRoO1xuICAgICAgICAgICAgICAgICAgcGF0aC5zdG9wKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdHJhdmVyc2VCYWJlbC5kZWZhdWx0KGJhYmVsQXN0LCB2aXNpdG9yKTtcblxuICAgICAgICAgICAgaWYgKCF0YXJnZXROb2RlUGF0aCkge1xuICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwNCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVGFyZ2V0IG5vZGUgbm90IGZvdW5kIGJ5IGxpbmUvY29sdW1uJywgZWRpdElkIH0pKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZ2VuZXJhdGVGdW5jdGlvbiA9IGdlbmVyYXRlLmRlZmF1bHQgfHwgZ2VuZXJhdGU7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRPcGVuaW5nRWxlbWVudCA9IHRhcmdldE5vZGVQYXRoLm5vZGU7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnRFbGVtZW50Tm9kZSA9IHRhcmdldE5vZGVQYXRoLnBhcmVudFBhdGg/Lm5vZGU7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGlzSW1hZ2VFbGVtZW50ID0gdGFyZ2V0T3BlbmluZ0VsZW1lbnQubmFtZSAmJiB0YXJnZXRPcGVuaW5nRWxlbWVudC5uYW1lLm5hbWUgPT09ICdpbWcnO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBsZXQgYmVmb3JlQ29kZSA9ICcnO1xuICAgICAgICAgICAgbGV0IGFmdGVyQ29kZSA9ICcnO1xuICAgICAgICAgICAgbGV0IG1vZGlmaWVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGlmIChpc0ltYWdlRWxlbWVudCkge1xuICAgICAgICAgICAgICAvLyBIYW5kbGUgaW1hZ2Ugc3JjIGF0dHJpYnV0ZSB1cGRhdGVcbiAgICAgICAgICAgICAgY29uc3QgYmVmb3JlT3V0cHV0ID0gZ2VuZXJhdGVGdW5jdGlvbih0YXJnZXRPcGVuaW5nRWxlbWVudCwge30pO1xuICAgICAgICAgICAgICBiZWZvcmVDb2RlID0gYmVmb3JlT3V0cHV0LmNvZGU7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBjb25zdCBzcmNBdHRyID0gdGFyZ2V0T3BlbmluZ0VsZW1lbnQuYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gXG4gICAgICAgICAgICAgICAgdC5pc0pTWEF0dHJpYnV0ZShhdHRyKSAmJiBhdHRyLm5hbWUgJiYgYXR0ci5uYW1lLm5hbWUgPT09ICdzcmMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBpZiAoc3JjQXR0ciAmJiB0LmlzU3RyaW5nTGl0ZXJhbChzcmNBdHRyLnZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHNyY0F0dHIudmFsdWUgPSB0LnN0cmluZ0xpdGVyYWwobmV3RnVsbFRleHQpO1xuICAgICAgICAgICAgICAgIG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCBhZnRlck91dHB1dCA9IGdlbmVyYXRlRnVuY3Rpb24odGFyZ2V0T3BlbmluZ0VsZW1lbnQsIHt9KTtcbiAgICAgICAgICAgICAgICBhZnRlckNvZGUgPSBhZnRlck91dHB1dC5jb2RlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpZiAocGFyZW50RWxlbWVudE5vZGUgJiYgdC5pc0pTWEVsZW1lbnQocGFyZW50RWxlbWVudE5vZGUpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmVmb3JlT3V0cHV0ID0gZ2VuZXJhdGVGdW5jdGlvbihwYXJlbnRFbGVtZW50Tm9kZSwge30pO1xuICAgICAgICAgICAgICAgIGJlZm9yZUNvZGUgPSBiZWZvcmVPdXRwdXQuY29kZTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBwYXJlbnRFbGVtZW50Tm9kZS5jaGlsZHJlbiA9IFtdO1xuICAgICAgICAgICAgICAgIGlmIChuZXdGdWxsVGV4dCAmJiBuZXdGdWxsVGV4dC50cmltKCkgIT09ICcnKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBuZXdUZXh0Tm9kZSA9IHQuanN4VGV4dChuZXdGdWxsVGV4dCk7XG4gICAgICAgICAgICAgICAgICBwYXJlbnRFbGVtZW50Tm9kZS5jaGlsZHJlbi5wdXNoKG5ld1RleHROb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IGFmdGVyT3V0cHV0ID0gZ2VuZXJhdGVGdW5jdGlvbihwYXJlbnRFbGVtZW50Tm9kZSwge30pO1xuICAgICAgICAgICAgICAgIGFmdGVyQ29kZSA9IGFmdGVyT3V0cHV0LmNvZGU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFtb2RpZmllZCkge1xuICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDQwOSwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnQ291bGQgbm90IGFwcGx5IGNoYW5nZXMgdG8gQVNULicgfSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBvdXRwdXQgPSBnZW5lcmF0ZUZ1bmN0aW9uKGJhYmVsQXN0LCB7fSk7XG4gICAgICAgICAgICBjb25zdCBuZXdDb250ZW50ID0gb3V0cHV0LmNvZGU7XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoYWJzb2x1dGVGaWxlUGF0aCwgbmV3Q29udGVudCwgJ3V0Zi04Jyk7XG4gICAgICAgICAgICB9IGNhdGNoICh3cml0ZUVycm9yKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFt2aXRlXVt2aXN1YWwtZWRpdG9yXSBFcnJvciBkdXJpbmcgZGlyZWN0IHdyaXRlIGZvciAke2ZpbGVQYXRofTpgLCB3cml0ZUVycm9yKTtcbiAgICAgICAgICAgICAgdGhyb3cgd3JpdGVFcnJvcjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbmV3RmlsZUNvbnRlbnQ6IG5ld0NvbnRlbnQsXG4gICAgICAgICAgICAgICAgYmVmb3JlQ29kZSxcbiAgICAgICAgICAgICAgICBhZnRlckNvZGUsXG4gICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvciBkdXJpbmcgZWRpdCBhcHBsaWNhdGlvbi4nIH0pKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuICB9O1xufSIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL2VtaWxpYW5zdXNhbnUvRG9jdW1lbnRzL1Byb2plY3RzIC9LRFBJbnNpZ2h0cy9wbHVnaW5zL3Zpc3VhbC1lZGl0b3JcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9lbWlsaWFuc3VzYW51L0RvY3VtZW50cy9Qcm9qZWN0cyAvS0RQSW5zaWdodHMvcGx1Z2lucy92aXN1YWwtZWRpdG9yL3Zpc3VhbC1lZGl0b3ItY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9lbWlsaWFuc3VzYW51L0RvY3VtZW50cy9Qcm9qZWN0cyUyMC9LRFBJbnNpZ2h0cy9wbHVnaW5zL3Zpc3VhbC1lZGl0b3IvdmlzdWFsLWVkaXRvci1jb25maWcuanNcIjtleHBvcnQgY29uc3QgUE9QVVBfU1RZTEVTID0gYFxuI2lubGluZS1lZGl0b3ItcG9wdXAge1xuICB3aWR0aDogMzYwcHg7XG4gIHBvc2l0aW9uOiBmaXhlZDtcbiAgei1pbmRleDogMTAwMDA7XG4gIGJhY2tncm91bmQ6ICMxNjE3MTg7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgYm9yZGVyOiAxcHggc29saWQgIzRhNTU2ODtcbiAgYm9yZGVyLXJhZGl1czogMTZweDtcbiAgcGFkZGluZzogOHB4O1xuICBib3gtc2hhZG93OiAwIDRweCAxMnB4IHJnYmEoMCwwLDAsMC4yKTtcbiAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgZ2FwOiAxMHB4O1xuICBkaXNwbGF5OiBub25lO1xufVxuXG5AbWVkaWEgKG1heC13aWR0aDogNzY4cHgpIHtcbiAgI2lubGluZS1lZGl0b3ItcG9wdXAge1xuICAgIHdpZHRoOiBjYWxjKDEwMCUgLSAyMHB4KTtcbiAgfVxufVxuXG4jaW5saW5lLWVkaXRvci1wb3B1cC5pcy1hY3RpdmUge1xuICBkaXNwbGF5OiBmbGV4O1xuICB0b3A6IDUwJTtcbiAgbGVmdDogNTAlO1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLCAtNTAlKTtcbn1cblxuI2lubGluZS1lZGl0b3ItcG9wdXAuaXMtZGlzYWJsZWQtdmlldyB7XG4gIHBhZGRpbmc6IDEwcHggMTVweDtcbn1cblxuI2lubGluZS1lZGl0b3ItcG9wdXAgdGV4dGFyZWEge1xuICBoZWlnaHQ6IDEwMHB4O1xuICBwYWRkaW5nOiA0cHggOHB4O1xuICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgY29sb3I6IHdoaXRlO1xuICBmb250LWZhbWlseTogaW5oZXJpdDtcbiAgZm9udC1zaXplOiAwLjg3NXJlbTtcbiAgbGluZS1oZWlnaHQ6IDEuNDI7XG4gIHJlc2l6ZTogbm9uZTtcbiAgb3V0bGluZTogbm9uZTtcbn1cblxuI2lubGluZS1lZGl0b3ItcG9wdXAgLmJ1dHRvbi1jb250YWluZXIge1xuICBkaXNwbGF5OiBmbGV4O1xuICBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kO1xuICBnYXA6IDEwcHg7XG59XG5cbiNpbmxpbmUtZWRpdG9yLXBvcHVwIC5wb3B1cC1idXR0b24ge1xuICBib3JkZXI6IG5vbmU7XG4gIHBhZGRpbmc6IDZweCAxNnB4O1xuICBib3JkZXItcmFkaXVzOiA4cHg7XG4gIGN1cnNvcjogcG9pbnRlcjtcbiAgZm9udC1zaXplOiAwLjc1cmVtO1xuICBmb250LXdlaWdodDogNzAwO1xuICBoZWlnaHQ6IDM0cHg7XG4gIG91dGxpbmU6IG5vbmU7XG59XG5cbiNpbmxpbmUtZWRpdG9yLXBvcHVwIC5zYXZlLWJ1dHRvbiB7XG4gIGJhY2tncm91bmQ6ICM2NzNkZTY7XG4gIGNvbG9yOiB3aGl0ZTtcbn1cblxuI2lubGluZS1lZGl0b3ItcG9wdXAgLmNhbmNlbC1idXR0b24ge1xuICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgYm9yZGVyOiAxcHggc29saWQgIzNiM2Q0YTtcbiAgY29sb3I6IHdoaXRlO1xuXG4gICY6aG92ZXIge1xuICAgIGJhY2tncm91bmQ6IzQ3NDk1ODtcbiAgfVxufVxuYDtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFBvcHVwSFRNTFRlbXBsYXRlKHNhdmVMYWJlbCwgY2FuY2VsTGFiZWwpIHtcbiAgcmV0dXJuIGBcbiAgICA8dGV4dGFyZWE+PC90ZXh0YXJlYT5cbiAgICA8ZGl2IGNsYXNzPVwiYnV0dG9uLWNvbnRhaW5lclwiPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cInBvcHVwLWJ1dHRvbiBjYW5jZWwtYnV0dG9uXCI+JHtjYW5jZWxMYWJlbH08L2J1dHRvbj5cbiAgICAgIDxidXR0b24gY2xhc3M9XCJwb3B1cC1idXR0b24gc2F2ZS1idXR0b25cIj4ke3NhdmVMYWJlbH08L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgYDtcbn07XG5cbmV4cG9ydCBjb25zdCBFRElUX01PREVfU1RZTEVTID0gYFxuICAjcm9vdFtkYXRhLWVkaXQtbW9kZS1lbmFibGVkPVwidHJ1ZVwiXSBbZGF0YS1lZGl0LWlkXSB7XG4gICAgY3Vyc29yOiBwb2ludGVyOyBcbiAgICBvdXRsaW5lOiAxcHggZGFzaGVkICMzNTdERjk7IFxuICAgIG91dGxpbmUtb2Zmc2V0OiAycHg7XG4gICAgbWluLWhlaWdodDogMWVtO1xuICB9XG4gICNyb290W2RhdGEtZWRpdC1tb2RlLWVuYWJsZWQ9XCJ0cnVlXCJdIHtcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gIH1cbiAgI3Jvb3RbZGF0YS1lZGl0LW1vZGUtZW5hYmxlZD1cInRydWVcIl0gW2RhdGEtZWRpdC1pZF06aG92ZXIge1xuICAgIGJhY2tncm91bmQtY29sb3I6ICMzNTdERjkzMztcbiAgICBvdXRsaW5lLWNvbG9yOiAjMzU3REY5OyBcbiAgfVxuXG4gIEBrZXlmcmFtZXMgZmFkZUluVG9vbHRpcCB7XG4gICAgZnJvbSB7XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDVweCk7XG4gICAgfVxuICAgIHRvIHtcbiAgICAgIG9wYWNpdHk6IDE7XG4gICAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMCk7XG4gICAgfVxuICB9XG5cbiAgI2lubGluZS1lZGl0b3ItZGlzYWJsZWQtdG9vbHRpcCB7XG4gICAgZGlzcGxheTogbm9uZTsgXG4gICAgb3BhY2l0eTogMDsgXG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIGJhY2tncm91bmQtY29sb3I6ICMxRDFFMjA7XG4gICAgY29sb3I6IHdoaXRlO1xuICAgIHBhZGRpbmc6IDRweCA4cHg7XG4gICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgIHotaW5kZXg6IDEwMDAxO1xuICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjM0IzRDRBO1xuICAgIG1heC13aWR0aDogMTg0cHg7XG4gICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICB9XG5cbiAgI2lubGluZS1lZGl0b3ItZGlzYWJsZWQtdG9vbHRpcC50b29sdGlwLWFjdGl2ZSB7XG4gICAgZGlzcGxheTogYmxvY2s7XG4gICAgYW5pbWF0aW9uOiBmYWRlSW5Ub29sdGlwIDAuMnMgZWFzZS1vdXQgZm9yd2FyZHM7XG4gIH1cbmA7IiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvZW1pbGlhbnN1c2FudS9Eb2N1bWVudHMvUHJvamVjdHMgL0tEUEluc2lnaHRzL3BsdWdpbnMvdmlzdWFsLWVkaXRvclwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2VtaWxpYW5zdXNhbnUvRG9jdW1lbnRzL1Byb2plY3RzIC9LRFBJbnNpZ2h0cy9wbHVnaW5zL3Zpc3VhbC1lZGl0b3Ivdml0ZS1wbHVnaW4tZWRpdC1tb2RlLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9lbWlsaWFuc3VzYW51L0RvY3VtZW50cy9Qcm9qZWN0cyUyMC9LRFBJbnNpZ2h0cy9wbHVnaW5zL3Zpc3VhbC1lZGl0b3Ivdml0ZS1wbHVnaW4tZWRpdC1tb2RlLmpzXCI7aW1wb3J0IHsgcmVhZEZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ3VybCc7XG5pbXBvcnQgeyBFRElUX01PREVfU1RZTEVTIH0gZnJvbSAnLi92aXN1YWwtZWRpdG9yLWNvbmZpZyc7XG5cbmNvbnN0IF9fZmlsZW5hbWUgPSBmaWxlVVJMVG9QYXRoKGltcG9ydC5tZXRhLnVybCk7XG5jb25zdCBfX2Rpcm5hbWUgPSByZXNvbHZlKF9fZmlsZW5hbWUsICcuLicpO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBpbmxpbmVFZGl0RGV2UGx1Z2luKCkge1xuICByZXR1cm4ge1xuICAgIG5hbWU6ICd2aXRlOmlubGluZS1lZGl0LWRldicsXG4gICAgYXBwbHk6ICdzZXJ2ZScsXG4gICAgdHJhbnNmb3JtSW5kZXhIdG1sKCkge1xuICAgICAgY29uc3Qgc2NyaXB0UGF0aCA9IHJlc29sdmUoX19kaXJuYW1lLCAnZWRpdC1tb2RlLXNjcmlwdC5qcycpO1xuICAgICAgY29uc3Qgc2NyaXB0Q29udGVudCA9IHJlYWRGaWxlU3luYyhzY3JpcHRQYXRoLCAndXRmLTgnKTtcblxuICAgICAgcmV0dXJuIFtcbiAgICAgICAge1xuICAgICAgICAgIHRhZzogJ3NjcmlwdCcsXG4gICAgICAgICAgYXR0cnM6IHsgdHlwZTogJ21vZHVsZScgfSxcbiAgICAgICAgICBjaGlsZHJlbjogc2NyaXB0Q29udGVudCxcbiAgICAgICAgICBpbmplY3RUbzogJ2JvZHknXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICB0YWc6ICdzdHlsZScsXG4gICAgICAgICAgY2hpbGRyZW46IEVESVRfTU9ERV9TVFlMRVMsXG4gICAgICAgICAgaW5qZWN0VG86ICdoZWFkJ1xuICAgICAgICB9XG4gICAgICBdO1xuICAgIH1cbiAgfTtcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL2VtaWxpYW5zdXNhbnUvRG9jdW1lbnRzL1Byb2plY3RzIC9LRFBJbnNpZ2h0c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2VtaWxpYW5zdXNhbnUvRG9jdW1lbnRzL1Byb2plY3RzIC9LRFBJbnNpZ2h0cy92aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvZW1pbGlhbnN1c2FudS9Eb2N1bWVudHMvUHJvamVjdHMlMjAvS0RQSW5zaWdodHMvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciwgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5cbmNvbnN0IGlzRGV2ID0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09ICdwcm9kdWN0aW9uJztcbmxldCBpbmxpbmVFZGl0UGx1Z2luLCBlZGl0TW9kZURldlBsdWdpbjtcblxuaWYgKGlzRGV2KSB7XG5cdGlubGluZUVkaXRQbHVnaW4gPSAoYXdhaXQgaW1wb3J0KCcuL3BsdWdpbnMvdmlzdWFsLWVkaXRvci92aXRlLXBsdWdpbi1yZWFjdC1pbmxpbmUtZWRpdG9yLmpzJykpLmRlZmF1bHQ7XG5cdGVkaXRNb2RlRGV2UGx1Z2luID0gKGF3YWl0IGltcG9ydCgnLi9wbHVnaW5zL3Zpc3VhbC1lZGl0b3Ivdml0ZS1wbHVnaW4tZWRpdC1tb2RlLmpzJykpLmRlZmF1bHQ7XG59XG5cbmNvbnN0IGNvbmZpZ0hvcml6b25zVml0ZUVycm9ySGFuZGxlciA9IGBcbmNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dGF0aW9ucykgPT4ge1xuXHRmb3IgKGNvbnN0IG11dGF0aW9uIG9mIG11dGF0aW9ucykge1xuXHRcdGZvciAoY29uc3QgYWRkZWROb2RlIG9mIG11dGF0aW9uLmFkZGVkTm9kZXMpIHtcblx0XHRcdGlmIChcblx0XHRcdFx0YWRkZWROb2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSAmJlxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0YWRkZWROb2RlLnRhZ05hbWU/LnRvTG93ZXJDYXNlKCkgPT09ICd2aXRlLWVycm9yLW92ZXJsYXknIHx8XG5cdFx0XHRcdFx0YWRkZWROb2RlLmNsYXNzTGlzdD8uY29udGFpbnMoJ2JhY2tkcm9wJylcblx0XHRcdFx0KVxuXHRcdFx0KSB7XG5cdFx0XHRcdGhhbmRsZVZpdGVPdmVybGF5KGFkZGVkTm9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxub2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHtcblx0Y2hpbGRMaXN0OiB0cnVlLFxuXHRzdWJ0cmVlOiB0cnVlXG59KTtcblxuZnVuY3Rpb24gaGFuZGxlVml0ZU92ZXJsYXkobm9kZSkge1xuXHRpZiAoIW5vZGUuc2hhZG93Um9vdCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGJhY2tkcm9wID0gbm9kZS5zaGFkb3dSb290LnF1ZXJ5U2VsZWN0b3IoJy5iYWNrZHJvcCcpO1xuXG5cdGlmIChiYWNrZHJvcCkge1xuXHRcdGNvbnN0IG92ZXJsYXlIdG1sID0gYmFja2Ryb3Aub3V0ZXJIVE1MO1xuXHRcdGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcblx0XHRjb25zdCBkb2MgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKG92ZXJsYXlIdG1sLCAndGV4dC9odG1sJyk7XG5cdFx0Y29uc3QgbWVzc2FnZUJvZHlFbGVtZW50ID0gZG9jLnF1ZXJ5U2VsZWN0b3IoJy5tZXNzYWdlLWJvZHknKTtcblx0XHRjb25zdCBmaWxlRWxlbWVudCA9IGRvYy5xdWVyeVNlbGVjdG9yKCcuZmlsZScpO1xuXHRcdGNvbnN0IG1lc3NhZ2VUZXh0ID0gbWVzc2FnZUJvZHlFbGVtZW50ID8gbWVzc2FnZUJvZHlFbGVtZW50LnRleHRDb250ZW50LnRyaW0oKSA6ICcnO1xuXHRcdGNvbnN0IGZpbGVUZXh0ID0gZmlsZUVsZW1lbnQgPyBmaWxlRWxlbWVudC50ZXh0Q29udGVudC50cmltKCkgOiAnJztcblx0XHRjb25zdCBlcnJvciA9IG1lc3NhZ2VUZXh0ICsgKGZpbGVUZXh0ID8gJyBGaWxlOicgKyBmaWxlVGV4dCA6ICcnKTtcblxuXHRcdHdpbmRvdy5wYXJlbnQucG9zdE1lc3NhZ2Uoe1xuXHRcdFx0dHlwZTogJ2hvcml6b25zLXZpdGUtZXJyb3InLFxuXHRcdFx0ZXJyb3IsXG5cdFx0fSwgJyonKTtcblx0fVxufVxuYDtcblxuY29uc3QgY29uZmlnSG9yaXpvbnNSdW50aW1lRXJyb3JIYW5kbGVyID0gYFxud2luZG93Lm9uZXJyb3IgPSAobWVzc2FnZSwgc291cmNlLCBsaW5lbm8sIGNvbG5vLCBlcnJvck9iaikgPT4ge1xuXHRjb25zdCBlcnJvckRldGFpbHMgPSBlcnJvck9iaiA/IEpTT04uc3RyaW5naWZ5KHtcblx0XHRuYW1lOiBlcnJvck9iai5uYW1lLFxuXHRcdG1lc3NhZ2U6IGVycm9yT2JqLm1lc3NhZ2UsXG5cdFx0c3RhY2s6IGVycm9yT2JqLnN0YWNrLFxuXHRcdHNvdXJjZSxcblx0XHRsaW5lbm8sXG5cdFx0Y29sbm8sXG5cdH0pIDogbnVsbDtcblxuXHR3aW5kb3cucGFyZW50LnBvc3RNZXNzYWdlKHtcblx0XHR0eXBlOiAnaG9yaXpvbnMtcnVudGltZS1lcnJvcicsXG5cdFx0bWVzc2FnZSxcblx0XHRlcnJvcjogZXJyb3JEZXRhaWxzXG5cdH0sICcqJyk7XG59O1xuYDtcblxuY29uc3QgY29uZmlnSG9yaXpvbnNDb25zb2xlRXJycm9IYW5kbGVyID0gYFxuY29uc3Qgb3JpZ2luYWxDb25zb2xlRXJyb3IgPSBjb25zb2xlLmVycm9yO1xuY29uc29sZS5lcnJvciA9IGZ1bmN0aW9uKC4uLmFyZ3MpIHtcblx0b3JpZ2luYWxDb25zb2xlRXJyb3IuYXBwbHkoY29uc29sZSwgYXJncyk7XG5cblx0bGV0IGVycm9yU3RyaW5nID0gJyc7XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgYXJnID0gYXJnc1tpXTtcblx0XHRpZiAoYXJnIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdGVycm9yU3RyaW5nID0gYXJnLnN0YWNrIHx8IFxcYFxcJHthcmcubmFtZX06IFxcJHthcmcubWVzc2FnZX1cXGA7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRpZiAoIWVycm9yU3RyaW5nKSB7XG5cdFx0ZXJyb3JTdHJpbmcgPSBhcmdzLm1hcChhcmcgPT4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgPyBKU09OLnN0cmluZ2lmeShhcmcpIDogU3RyaW5nKGFyZykpLmpvaW4oJyAnKTtcblx0fVxuXG5cdHdpbmRvdy5wYXJlbnQucG9zdE1lc3NhZ2Uoe1xuXHRcdHR5cGU6ICdob3Jpem9ucy1jb25zb2xlLWVycm9yJyxcblx0XHRlcnJvcjogZXJyb3JTdHJpbmdcblx0fSwgJyonKTtcbn07XG5gO1xuXG5jb25zdCBjb25maWdXaW5kb3dGZXRjaE1vbmtleVBhdGNoID0gYFxuY29uc3Qgb3JpZ2luYWxGZXRjaCA9IHdpbmRvdy5mZXRjaDtcblxud2luZG93LmZldGNoID0gZnVuY3Rpb24oLi4uYXJncykge1xuXHRjb25zdCB1cmwgPSBhcmdzWzBdIGluc3RhbmNlb2YgUmVxdWVzdCA/IGFyZ3NbMF0udXJsIDogYXJnc1swXTtcblxuXHQvLyBTa2lwIFdlYlNvY2tldCBVUkxzXG5cdGlmICh1cmwuc3RhcnRzV2l0aCgnd3M6JykgfHwgdXJsLnN0YXJ0c1dpdGgoJ3dzczonKSkge1xuXHRcdHJldHVybiBvcmlnaW5hbEZldGNoLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHR9XG5cblx0cmV0dXJuIG9yaWdpbmFsRmV0Y2guYXBwbHkodGhpcywgYXJncylcblx0XHQudGhlbihhc3luYyByZXNwb25zZSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50VHlwZSA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdDb250ZW50LVR5cGUnKSB8fCAnJztcblxuXHRcdFx0Ly8gRXhjbHVkZSBIVE1MIGRvY3VtZW50IHJlc3BvbnNlc1xuXHRcdFx0Y29uc3QgaXNEb2N1bWVudFJlc3BvbnNlID1cblx0XHRcdFx0Y29udGVudFR5cGUuaW5jbHVkZXMoJ3RleHQvaHRtbCcpIHx8XG5cdFx0XHRcdGNvbnRlbnRUeXBlLmluY2x1ZGVzKCdhcHBsaWNhdGlvbi94aHRtbCt4bWwnKTtcblxuXHRcdFx0aWYgKCFyZXNwb25zZS5vayAmJiAhaXNEb2N1bWVudFJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2VDbG9uZSA9IHJlc3BvbnNlLmNsb25lKCk7XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3JGcm9tUmVzID0gYXdhaXQgcmVzcG9uc2VDbG9uZS50ZXh0KCk7XG5cdFx0XHRcdFx0Y29uc3QgcmVxdWVzdFVybCA9IHJlc3BvbnNlLnVybDtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKFxcYEZldGNoIGVycm9yIGZyb20gXFwke3JlcXVlc3RVcmx9OiBcXCR7ZXJyb3JGcm9tUmVzfVxcYCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHR9KVxuXHRcdC5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHRpZiAoIXVybC5tYXRjaCgvXFwuaHRtbD8kL2kpKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9KTtcbn07XG5gO1xuXG5jb25zdCBhZGRUcmFuc2Zvcm1JbmRleEh0bWwgPSB7XG5cdG5hbWU6ICdhZGQtdHJhbnNmb3JtLWluZGV4LWh0bWwnLFxuXHR0cmFuc2Zvcm1JbmRleEh0bWwoaHRtbCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRodG1sLFxuXHRcdFx0dGFnczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFnOiAnc2NyaXB0Jyxcblx0XHRcdFx0XHRhdHRyczogeyB0eXBlOiAnbW9kdWxlJyB9LFxuXHRcdFx0XHRcdGNoaWxkcmVuOiBjb25maWdIb3Jpem9uc1J1bnRpbWVFcnJvckhhbmRsZXIsXG5cdFx0XHRcdFx0aW5qZWN0VG86ICdoZWFkJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhZzogJ3NjcmlwdCcsXG5cdFx0XHRcdFx0YXR0cnM6IHsgdHlwZTogJ21vZHVsZScgfSxcblx0XHRcdFx0XHRjaGlsZHJlbjogY29uZmlnSG9yaXpvbnNWaXRlRXJyb3JIYW5kbGVyLFxuXHRcdFx0XHRcdGluamVjdFRvOiAnaGVhZCcsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0YWc6ICdzY3JpcHQnLFxuXHRcdFx0XHRcdGF0dHJzOiB7dHlwZTogJ21vZHVsZSd9LFxuXHRcdFx0XHRcdGNoaWxkcmVuOiBjb25maWdIb3Jpem9uc0NvbnNvbGVFcnJyb0hhbmRsZXIsXG5cdFx0XHRcdFx0aW5qZWN0VG86ICdoZWFkJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhZzogJ3NjcmlwdCcsXG5cdFx0XHRcdFx0YXR0cnM6IHsgdHlwZTogJ21vZHVsZScgfSxcblx0XHRcdFx0XHRjaGlsZHJlbjogY29uZmlnV2luZG93RmV0Y2hNb25rZXlQYXRjaCxcblx0XHRcdFx0XHRpbmplY3RUbzogJ2hlYWQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9O1xuXHR9LFxufTtcblxuY29uc29sZS53YXJuID0gKCkgPT4ge307XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcigpXG5jb25zdCBsb2dnZXJFcnJvciA9IGxvZ2dlci5lcnJvclxuXG5sb2dnZXIuZXJyb3IgPSAobXNnLCBvcHRpb25zKSA9PiB7XG5cdGlmIChvcHRpb25zPy5lcnJvcj8udG9TdHJpbmcoKS5pbmNsdWRlcygnQ3NzU3ludGF4RXJyb3I6IFtwb3N0Y3NzXScpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0bG9nZ2VyRXJyb3IobXNnLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcblx0Y3VzdG9tTG9nZ2VyOiBsb2dnZXIsXG5cdHBsdWdpbnM6IFtcblx0XHQuLi4oaXNEZXYgPyBbaW5saW5lRWRpdFBsdWdpbigpLCBlZGl0TW9kZURldlBsdWdpbigpXSA6IFtdKSxcblx0XHRyZWFjdCgpLFxuXHRcdC4uLihpc0RldiA/IFthZGRUcmFuc2Zvcm1JbmRleEh0bWxdIDogW10pXG5cdF0sXG5cdHNlcnZlcjoge1xuXHRcdGNvcnM6IHRydWUsXG5cdFx0aGVhZGVyczoge1xuXHRcdFx0J0Nyb3NzLU9yaWdpbi1FbWJlZGRlci1Qb2xpY3knOiAnY3JlZGVudGlhbGxlc3MnLFxuXHRcdH0sXG5cdFx0YWxsb3dlZEhvc3RzOiB0cnVlLFxuXHR9LFxuXHRyZXNvbHZlOiB7XG5cdFx0ZXh0ZW5zaW9uczogWycuanN4JywgJy5qcycsICcudHN4JywgJy50cycsICcuanNvbicsIF0sXG5cdFx0YWxpYXM6IHtcblx0XHRcdCdAJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJyksXG5cdFx0fSxcblx0fSxcblx0YnVpbGQ6IHtcblx0XHRyb2xsdXBPcHRpb25zOiB7XG5cdFx0XHRleHRlcm5hbDogW1xuXHRcdFx0XHQnQGJhYmVsL3BhcnNlcicsXG5cdFx0XHRcdCdAYmFiZWwvdHJhdmVyc2UnLFxuXHRcdFx0XHQnQGJhYmVsL2dlbmVyYXRvcicsXG5cdFx0XHRcdCdAYmFiZWwvdHlwZXMnXG5cdFx0XHRdXG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBMGIsT0FBTyxVQUFVO0FBQzNjLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYTtBQUN0QixPQUFPLG1CQUFtQjtBQUMxQixPQUFPLGNBQWM7QUFDckIsWUFBWSxPQUFPO0FBQ25CLE9BQU8sUUFBUTtBQU9mLFNBQVMsWUFBWSxRQUFRO0FBQzNCLFFBQU0sUUFBUSxPQUFPLE1BQU0sR0FBRztBQUU5QixNQUFJLE1BQU0sU0FBUyxHQUFHO0FBQ3BCLFdBQU87QUFBQSxFQUNUO0FBRUEsUUFBTSxTQUFTLFNBQVMsTUFBTSxHQUFHLEVBQUUsR0FBRyxFQUFFO0FBQ3hDLFFBQU0sT0FBTyxTQUFTLE1BQU0sR0FBRyxFQUFFLEdBQUcsRUFBRTtBQUN0QyxRQUFNLFdBQVcsTUFBTSxNQUFNLEdBQUcsRUFBRSxFQUFFLEtBQUssR0FBRztBQUU1QyxNQUFJLENBQUMsWUFBWSxNQUFNLElBQUksS0FBSyxNQUFNLE1BQU0sR0FBRztBQUM3QyxXQUFPO0FBQUEsRUFDVDtBQUVBLFNBQU8sRUFBRSxVQUFVLE1BQU0sT0FBTztBQUNsQztBQUVBLFNBQVMscUJBQXFCLG9CQUFvQixrQkFBa0I7QUFDaEUsTUFBSSxDQUFDLHNCQUFzQixDQUFDLG1CQUFtQjtBQUFNLFdBQU87QUFDNUQsUUFBTSxXQUFXLG1CQUFtQjtBQUdwQyxNQUFJLFNBQVMsU0FBUyxtQkFBbUIsaUJBQWlCLFNBQVMsU0FBUyxJQUFJLEdBQUc7QUFDL0UsV0FBTztBQUFBLEVBQ1g7QUFHQSxNQUFJLFNBQVMsU0FBUyx5QkFBeUIsU0FBUyxZQUFZLFNBQVMsU0FBUyxTQUFTLG1CQUFtQixpQkFBaUIsU0FBUyxTQUFTLFNBQVMsSUFBSSxHQUFHO0FBQ2pLLFdBQU87QUFBQSxFQUNYO0FBRUEsU0FBTztBQUNYO0FBRUEsU0FBUyxpQkFBaUIsYUFBYTtB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QVMsYUFBYTtBQUM1QixJQUFNLGNBQWMsT0FBTztBQUUzQixPQUFPLFFBQVEsQ0FBQyxLQUFLLFlBQVk7QUF2TGpDO0FBd0xDLE9BQUksd0NBQVMsVUFBVCxtQkFBZ0IsV0FBVyxTQUFTLDhCQUE4QjtBQUNyRTtBQUFBLEVBQ0Q7QUFFQSxjQUFZLEtBQUssT0FBTztBQUN6QjtBQUVBLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzNCLGNBQWM7QUFBQSxFQUNkLFNBQVM7QUFBQSxJQUNSLEdBQUksUUFBUSxDQUFDQSxrQkFBaUIsR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUM7QUFBQSxJQUN6RCxNQUFNO0FBQUEsSUFDTixHQUFJLFFBQVEsQ0FBQyxxQkFBcUIsSUFBSSxDQUFDO0FBQUEsRUFDeEM7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFNBQVM7QUFBQSxNQUNSLGdDQUFnQztBQUFBLElBQ2pDO0FBQUEsSUFDQSxjQUFjO0FBQUEsRUFDZjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1IsWUFBWSxDQUFDLFFBQVEsT0FBTyxRQUFRLE9BQU8sT0FBUztBQUFBLElBQ3BELE9BQU87QUFBQSxNQUNOLEtBQUtDLE1BQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTixlQUFlO0FBQUEsTUFDZCxVQUFVO0FBQUEsUUFDVDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbInBhdGgiLCAiX19kaXJuYW1lIiwgImZpbGVVUkxUb1BhdGgiLCAiX19kaXJuYW1lIiwgIl9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwiLCAiX19maWxlbmFtZSIsICJwYXRoIiwgImlubGluZUVkaXRQbHVnaW4iLCAicGF0aCJdCn0K
