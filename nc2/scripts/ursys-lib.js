(function() {
  'use strict';

  var globals = typeof global === 'undefined' ? self : global;
  if (typeof globals.require === 'function') return;

  var modules = {};
  var cache = {};
  var aliases = {};
  var has = {}.hasOwnProperty;

  var expRe = /^\.\.?(\/|$)/;
  var expand = function(root, name) {
    var results = [], part;
    var parts = (expRe.test(name) ? root + '/' + name : name).split('/');
    for (var i = 0, length = parts.length; i < length; i++) {
      part = parts[i];
      if (part === '..') {
        results.pop();
      } else if (part !== '.' && part !== '') {
        results.push(part);
      }
    }
    return results.join('/');
  };

  var dirname = function(path) {
    return path.split('/').slice(0, -1).join('/');
  };

  var localRequire = function(path) {
    return function expanded(name) {
      var absolute = expand(dirname(path), name);
      return globals.require(absolute, path);
    };
  };

  var initModule = function(name, definition) {
    var hot = hmr && hmr.createHot(name);
    var module = {id: name, exports: {}, hot: hot};
    cache[name] = module;
    definition(module.exports, localRequire(name), module);
    return module.exports;
  };

  var expandAlias = function(name) {
    var val = aliases[name];
    return (val && name !== val) ? expandAlias(val) : name;
  };

  var _resolve = function(name, dep) {
    return expandAlias(expand(dirname(name), dep));
  };

  var require = function(name, loaderPath) {
    if (loaderPath == null) loaderPath = '/';
    var path = expandAlias(name);

    if (has.call(cache, path)) return cache[path].exports;
    if (has.call(modules, path)) return initModule(path, modules[path]);

    throw new Error("Cannot find module '" + name + "' from '" + loaderPath + "'");
  };

  require.alias = function(from, to) {
    aliases[to] = from;
  };

  var extRe = /\.[^.\/]+$/;
  var indexRe = /\/index(\.[^\/]+)?$/;
  var addExtensions = function(bundle) {
    if (extRe.test(bundle)) {
      var alias = bundle.replace(extRe, '');
      if (!has.call(aliases, alias) || aliases[alias].replace(extRe, '') === alias + '/index') {
        aliases[alias] = bundle;
      }
    }

    if (indexRe.test(bundle)) {
      var iAlias = bundle.replace(indexRe, '');
      if (!has.call(aliases, iAlias)) {
        aliases[iAlias] = bundle;
      }
    }
  };

  require.register = require.define = function(bundle, fn) {
    if (bundle && typeof bundle === 'object') {
      for (var key in bundle) {
        if (has.call(bundle, key)) {
          require.register(key, bundle[key]);
        }
      }
    } else {
      modules[bundle] = fn;
      delete cache[bundle];
      addExtensions(bundle);
    }
  };

  require.list = function() {
    var list = [];
    for (var item in modules) {
      if (has.call(modules, item)) {
        list.push(item);
      }
    }
    return list;
  };

  var hmr = globals._hmr && new globals._hmr(_resolve, require, modules, cache);
  require._cache = cache;
  require.hmr = hmr && hmr.wrap;
  require.brunch = true;
  globals.require = require;
})();

(function() {
var global = typeof window === 'undefined' ? this : window;require.register("fs", function(exports, require, module) {
  module.exports = {};
});
require.register("tls", function(exports, require, module) {
  module.exports = {};
});
require.register("child_process", function(exports, require, module) {
  module.exports = {};
});
var process;
var __makeRelativeRequire = function(require, mappings, pref) {
  var none = {};
  var tryReq = function(name, pref) {
    var val;
    try {
      val = require(pref + '/node_modules/' + name);
      return val;
    } catch (e) {
      if (e.toString().indexOf('Cannot find module') === -1) {
        throw e;
      }

      if (pref.indexOf('node_modules') !== -1) {
        var s = pref.split('/');
        var i = s.lastIndexOf('node_modules');
        var newPref = s.slice(0, i).join('/');
        return tryReq(name, newPref);
      }
    }
    return none;
  };
  return function(name) {
    if (name in mappings) name = mappings[name];
    if (!name) return;
    if (name[0] !== '.' && pref) {
      var val = tryReq(name, pref);
      if (val !== none) return val;
    }
    return require(name);
  }
};

require.register("@ursys/addons/_dist/addons-client-cjs.js", function(exports, require, module) {
  require = __makeRelativeRequire(require, {}, "@ursys/addons");
  (function() {
    var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// _ur_addons/@addons-client.ts
var addons_client_exports = {};
__export(addons_client_exports, {
  AddonClientTest: () => AddonClientTest,
  COMMENT: () => ac_comment_exports
});
module.exports = __toCommonJS(addons_client_exports);

// _ur/_dist/client-esm.js
var client_esm_exports = {};
__export(client_esm_exports, {
  ClientTest: () => ClientTest,
  ConsoleStyler: () => makeStyleFormatter
});
var __create = Object.create;
var __defProp2 = Object.defineProperty;
var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
var __getOwnPropNames2 = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp2 = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames2(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps2 = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames2(from))
      if (!__hasOwnProp2.call(to, key) && key !== except)
        __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps2(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp2(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var require_declare_console = __commonJS({
  "_ur/common/declare-console.js"(exports, module2) {
    var TERM_COLORS = {
      // TOUT = makeTerminalOut(str); TOUT('hi')
      Reset: "\x1B[0m",
      Bright: "\x1B[1m",
      Dim: "\x1B[2m",
      Underscore: "\x1B[4m",
      Blink: "\x1B[5m",
      Reverse: "\x1B[7m",
      Hidden: "\x1B[8m",
      //
      Black: "\x1B[30m",
      White: "\x1B[37m",
      Red: "\x1B[31m",
      Orange: "\x1B[38;5;202m",
      Yellow: "\x1B[33m",
      Green: "\x1B[32m",
      Cyan: "\x1B[36m",
      Blue: "\x1B[34m",
      Purple: "\x1B[35m",
      //
      BgBlack: "\x1B[40m",
      BgGray: "\x1B[100m",
      BgWhite: "\x1B[47m",
      BgRed: "\x1B[41m",
      BgOrange: "\x1B[48;5;202m",
      BgYellow: "\x1B[43m",
      BgCyan: "\x1B[46m",
      BgGreen: "\x1B[42m",
      BgBlue: "\x1B[44m",
      BgPurple: "\x1B[45m",
      BgPink: "\x1B[105m",
      // FORMATS
      TagBlack: "\x1B[30;1m",
      TagWhite: "\x1B[37;1m",
      TagRed: "\x1B[41;37m",
      TagOrange: "\x1B[43;37m",
      TagYellow: "\x1B[43;30m",
      TagGreen: "\x1B[42;30m",
      TagCyan: "\x1B[46;37m",
      TagBlue: "\x1B[44;37m",
      TagPurple: "\x1B[45;37m",
      TagPink: "\x1B[105;1m",
      TagGray: "\x1B[100;37m",
      TagNull: "\x1B[2;37m"
    };
    var CSS_COMMON = "padding:3px 5px;border-radius:2px;";
    var CSS_COLORS = {
      Reset: "color:auto;background-color:auto",
      // COLOR FOREGROUND
      Black: "color:black",
      White: "color:white",
      Red: "color:red",
      Orange: "color:orange",
      Yellow: "color:orange",
      Green: "color:green",
      Cyan: "color:cyan",
      Blue: "color:blue",
      Magenta: "color:magenta",
      Pink: "color:pink",
      // COLOR BACKGROUND
      TagRed: `color:#000;background-color:#f66;${CSS_COMMON}`,
      TagOrange: `color:#000;background-color:#fa4;${CSS_COMMON}`,
      TagYellow: `color:#000;background-color:#fd4;${CSS_COMMON}`,
      TagGreen: `color:#000;background-color:#5c8;${CSS_COMMON}`,
      TagCyan: `color:#000;background-color:#2dd;${CSS_COMMON}`,
      TagBlue: `color:#000;background-color:#2bf;${CSS_COMMON}`,
      TagPurple: `color:#000;background-color:#b6f;${CSS_COMMON}`,
      TagPink: `color:#000;background-color:#f9f;${CSS_COMMON}`,
      TagGray: `color:#fff;background-color:#999;${CSS_COMMON}`,
      TagNull: `color:#999;border:1px solid #ddd;${CSS_COMMON}`,
      // COLOR BACKGROUND DARK (BROWSER ONLY)
      TagDkRed: `color:white;background-color:maroon;${CSS_COMMON}`,
      TagDkOrange: `color:white;background-color:burntorange;${CSS_COMMON}`,
      TagDkYellow: `color:white;background-color:brown;${CSS_COMMON}`,
      TagDkGreen: `color:white;background-color:forestgreen;${CSS_COMMON}`,
      TagDkCyan: `color:white;background-color:cerulean;${CSS_COMMON}`,
      TagDkBlue: `color:white;background-color:darkblue;${CSS_COMMON}`,
      TagDkPurple: `color:white;background-color:indigo;${CSS_COMMON}`,
      TagDkPink: `color:white;background-color:fuchsia;${CSS_COMMON}`
    };
    TERM_COLORS.TagBuild = TERM_COLORS.TagGray;
    TERM_COLORS.TagError = TERM_COLORS.TagRed;
    TERM_COLORS.TagAlert = TERM_COLORS.TagOrange;
    TERM_COLORS.TagTest = TERM_COLORS.TagRed;
    TERM_COLORS.TagSystem = TERM_COLORS.TagGray;
    TERM_COLORS.TagServer = TERM_COLORS.TagGray;
    TERM_COLORS.TagDatabase = TERM_COLORS.TagCyan;
    TERM_COLORS.TagNetwork = TERM_COLORS.TagCyan;
    TERM_COLORS.TagUR = TERM_COLORS.TagBlue;
    TERM_COLORS.TagURNET = TERM_COLORS.TagBlue;
    TERM_COLORS.TagURMOD = TERM_COLORS.TagBlue;
    TERM_COLORS.TagAppMain = TERM_COLORS.TagGreen;
    TERM_COLORS.TagAppModule = TERM_COLORS.TagGreen;
    TERM_COLORS.TagAppState = TERM_COLORS.TagGreen;
    TERM_COLORS.TagAppCore = TERM_COLORS.TagGreen;
    TERM_COLORS.TagDataCore = TERM_COLORS.TagGreen;
    TERM_COLORS.TagUI = TERM_COLORS.TagPurple;
    TERM_COLORS.TagPhase = TERM_COLORS.TagPink;
    TERM_COLORS.TagEvent = TERM_COLORS.TagPink;
    TERM_COLORS.TagStream = TERM_COLORS.TagPink;
    CSS_COLORS.TagDebug = `color:#fff;background-color:IndianRed;${CSS_COMMON}`;
    CSS_COLORS.TagWarning = `color:#fff;background:linear-gradient(
  -45deg,
  rgb(29,161,242),
  rgb(184,107,107),
  rgb(76,158,135)
);${CSS_COMMON}`;
    CSS_COLORS.TagTest = CSS_COLORS.TagRed;
    CSS_COLORS.TagSystem = CSS_COLORS.TagGray;
    CSS_COLORS.TagServer = CSS_COLORS.TagGray;
    CSS_COLORS.TagDatabase = CSS_COLORS.TagCyan;
    CSS_COLORS.TagNetwork = CSS_COLORS.TagCyan;
    CSS_COLORS.TagUR = `color:CornflowerBlue;border:1px solid CornflowerBlue;${CSS_COMMON}`;
    CSS_COLORS.TagURNET = `color:#fff;background-color:MediumSlateBlue;${CSS_COMMON}`;
    CSS_COLORS.TagURMOD = `color:#fff;background:linear-gradient(
  -45deg,
  CornflowerBlue 0%,
  LightSkyBlue 25%,
  RoyalBlue 100%
);${CSS_COMMON}`;
    CSS_COLORS.TagAppMain = CSS_COLORS.TagGreen;
    CSS_COLORS.TagAppModule = CSS_COLORS.TagGreen;
    CSS_COLORS.TagAppState = `color:#fff;background-color:Navy;${CSS_COMMON}`;
    CSS_COLORS.TagUI = CSS_COLORS.TagDkOrange;
    CSS_COLORS.TagEvent = CSS_COLORS.TagDkOrange;
    CSS_COLORS.TagStream = CSS_COLORS.TagDkOrange;
    CSS_COLORS.TagPhase = `color:#fff;background-color:MediumVioletRed;${CSS_COMMON}`;
    module2.exports = {
      TERM_COLORS,
      CSS_COLORS
    };
  }
});
var require_prompts = __commonJS({
  "_ur/common/prompts.js"(exports, module2) {
    var IS_NODE = typeof window === "undefined";
    var IS_MOBILE = !IS_NODE && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    var D_CONSOLE = require_declare_console();
    var { TERM_COLORS, CSS_COLORS } = D_CONSOLE;
    var DEFAULT_PADDING = IS_NODE ? 10 : 8;
    var DEFAULT_SPACE = IS_NODE ? " ".padStart(DEFAULT_PADDING, " ") : " ".padStart(DEFAULT_PADDING + 4, " ");
    var DEFAULT_COLOR = "TagNull";
    var HTCONSOLES = {};
    var SHOW = true;
    var PROMPT_DICT = {
      // URSYS-RELATED MODULES
      "UR": [SHOW, "TagRed"],
      // SERVERS
      "APPSRV": [SHOW, "Yellow"],
      "GEMSRV": [SHOW, "Yellow"],
      // SPECIAL
      "-": [SHOW, "TagNull"]
    };
    function padString(str, padding = DEFAULT_PADDING) {
      let len = str.length;
      const nbsp = String.fromCharCode(160);
      if (IS_NODE)
        return `${str.padEnd(padding, " ")}`;
      if (padding === 0)
        return `${str}`;
      if (len >= padding)
        str = str.substr(0, padding);
      else
        str = str.padEnd(padding, nbsp);
      return `${str}`;
    }
    function m_SetPromptColors(match, color = DEFAULT_COLOR) {
      if (typeof match !== "string")
        throw Error("match prompt must be string");
      match = match.trim();
      if (match === "")
        throw Error("match prompt cannot be empty");
      let colorTable = IS_NODE ? TERM_COLORS : CSS_COLORS;
      let validColor = false;
      validColor = colorTable[color] !== void 0;
      if (!validColor)
        colorTable = IS_NODE ? CSS_COLORS : TERM_COLORS;
      validColor = colorTable[color] !== void 0;
      if (!validColor)
        throw Error(`prompt color ${color} is not defined in either table`);
      PROMPT_DICT[match] = [true, color];
      return colorTable;
    }
    function m_GetEnvColor(prompt, tagColor) {
      const colorTable = m_SetPromptColors(prompt, tagColor);
      const [dbg_mode, defcol] = PROMPT_DICT[prompt.trim()] || [SHOW, DEFAULT_COLOR];
      const ucolor = colorTable[tagColor];
      const dcolor = colorTable[defcol];
      const color = ucolor || dcolor;
      const reset = colorTable.Reset;
      return [dbg_mode, color, reset];
    }
    function m_MakeColorArray(prompt, colorName) {
      const [dbg, color, reset] = m_GetEnvColor(prompt, colorName);
      if (!(dbg || IS_NODE))
        return [];
      return IS_NODE ? [`${color}${padString(prompt)}${reset}   `] : [`%c${padString(prompt)}%c `, color, reset];
    }
    function m_MakeColorPromptFunction(prompt, colorName, opt = {}) {
      const textColor = opt.color || "Reset";
      const dim = opt.dim || false;
      return IS_NODE ? (str, ...args) => {
        if (args === void 0)
          args = "";
        let TAG = TERM_COLORS[colorName];
        let TEXT = TERM_COLORS[textColor];
        let RST = TERM_COLORS.Reset;
        let PR2 = padString(prompt);
        if (dim)
          TEXT += TERM_COLORS.Dim;
        console.log(`${RST}${TAG}${PR2}${RST}${TEXT}    ${str}`, ...args);
      } : (str, ...args) => {
        if (args === void 0)
          args = "";
        let TEXT = TERM_COLORS[textColor];
        let RST = CSS_COLORS.Reset;
        let PR2 = padString(prompt);
        console.log(`%c${PR2}%c%c ${str}`, RST, TEXT, ...args);
      };
    }
    function m_GetDivText(id) {
      const el = document.getElementById(id);
      if (!el) {
        console.log(`GetDivText: element ${id} does not exist`);
        return void 0;
      }
      const text = el.textContent;
      if (text === void 0) {
        console.log(`HTMLTextOut: element ${id} does not have textContent`);
        return {};
      }
      el.style.whiteSpace = "pre";
      el.style.fontFamily = "monospace";
      return { element: el, text };
    }
    function m_HTMLTextJumpRow(row, lineBuffer, id) {
      const { element, text } = m_GetDivText(id);
      if (text === void 0)
        return lineBuffer;
      if (lineBuffer.length === 0) {
        console.log(`initializing linebuffer from element id='${id}'`);
        lineBuffer = text.split("\n");
      }
      if (row > lineBuffer.length - 1) {
        const count = row + 1 - lineBuffer.length;
        for (let i = count; i > 0; i--)
          lineBuffer.push("");
      }
      return lineBuffer;
    }
    function m_HTMLTextPrint(str = "", lineBuffer, id) {
      const { element, text } = m_GetDivText(id);
      if (!text)
        return lineBuffer;
      lineBuffer.push(str);
      element.textContent = lineBuffer.join("\n");
      return lineBuffer;
    }
    function m_HTMLTextPlot(str = "", lineBuffer, id, row = 0, col = 0) {
      const { element, text } = m_GetDivText(id);
      if (!element)
        return lineBuffer;
      if (text === void 0) {
        console.log(`HTMLTextOut: element ${id} does not have textContent`);
        return lineBuffer;
      }
      lineBuffer = m_HTMLTextJumpRow(row, lineBuffer, id);
      let line = lineBuffer[row];
      if (line === void 0) {
        console.log(`HTMLTextOut: unexpected line error for line ${row}`);
        return lineBuffer;
      }
      if (col + str.length > line.length + str.length) {
        for (let i = 0; i < col + str.length - line.length; i++)
          line += " ";
      }
      let p1 = line.substr(0, col);
      let p3 = line.substr(col + str.length, line.length - (col + str.length));
      lineBuffer[row] = `${p1}${str}${p3}`;
      element.textContent = lineBuffer.join("\n");
      return lineBuffer;
    }
    function makeStyleFormatter2(prompt, tagColor) {
      if (prompt.startsWith("UR") && tagColor === void 0)
        tagColor = "TagUR";
      let outArray = m_MakeColorArray(prompt, tagColor);
      if (outArray.length === 0)
        return () => [];
      if (IS_MOBILE)
        outArray = [`${prompt}:`];
      const f = (str, ...args) => [...outArray, str, ...args];
      f._ = `
${DEFAULT_SPACE}`;
      return f;
    }
    function makeErrorFormatter(pr = "") {
      const bg = "rgba(255,0,0,1)";
      const bga = "rgba(255,0,0,0.15)";
      pr = `ERROR ${pr}`.trim();
      return (str, ...args) => [
        `%c${pr}%c${str}`,
        `color:#fff;background-color:${bg};padding:3px 7px 3px 10px;border-radius:10px 0 0 10px;`,
        `color:${bg};background-color:${bga};padding:3px 5px;`,
        ...args
      ];
    }
    function makeWarningFormatter(pr = "") {
      const bg = "rgba(255,150,0,1)";
      const bga = "rgba(255,150,0,0.15)";
      pr = `WARN ${pr}`.trim();
      return (str, ...args) => [
        `%c${pr}%c${str}`,
        `color:#fff;background-color:${bg};padding:3px 7px 3px 10px;border-radius:10px 0 0 10px;`,
        `color:${bg};background-color:${bga};padding:3px 5px;`,
        ...args
      ];
    }
    function dbgPrint(pr, bg = "MediumVioletRed") {
      return [
        `%c${pr}%c`,
        `color:#fff;background-color:${bg};padding:3px 10px;border-radius:10px;`,
        "color:auto;background-color:auto"
      ];
    }
    function colorTagString(str, tagColor) {
      return m_MakeColorArray(str, tagColor);
    }
    function makeTerminalOut(prompt, tagColor = DEFAULT_COLOR) {
      const wrap = m_MakeColorPromptFunction(prompt, tagColor);
      wrap.warn = m_MakeColorPromptFunction(prompt, "TagYellow", { color: "Yellow" });
      wrap.error = m_MakeColorPromptFunction(prompt, "TagRed", { color: "Red" });
      wrap.info = m_MakeColorPromptFunction(prompt, "TagGray", { dim: true });
      wrap.DIM = "\x1B[2m";
      wrap.BRI = "\x1B[1m";
      wrap.RST = "\x1B[0m";
      return wrap;
    }
    function makeHTMLConsole(divId, row = 0, col = 0) {
      const ERP = makeStyleFormatter2("makeHTMLConsole", "Red");
      let buffer = [];
      if (typeof divId !== "string")
        throw Error("bad id");
      if (!document.getElementById(divId)) {
        console.warn(...ERP(`id '${divId}' doesn't exist`));
        return {
          print: () => {
          },
          plot: () => {
          },
          clear: () => {
          },
          gotoRow: () => {
          }
        };
      }
      let hcon;
      if (HTCONSOLES[divId]) {
        hcon = HTCONSOLES[divId];
      } else {
        hcon = {
          buffer: [],
          plot: (str, y = row, x = col) => {
            buffer = m_HTMLTextPlot(str, buffer, divId, y, x);
          },
          print: (str) => {
            buffer = m_HTMLTextPrint(str, buffer, divId);
          },
          clear: (startRow = 0, endRow = buffer.length) => {
            buffer.splice(startRow, endRow);
          },
          gotoRow: (row2) => {
            buffer = m_HTMLTextJumpRow(row2, buffer, divId);
          }
        };
        HTCONSOLES[divId] = hcon;
      }
      return hcon;
    }
    function printTagColors() {
      const colortable = IS_NODE ? TERM_COLORS : CSS_COLORS;
      const colors = Object.keys(colortable).filter((element) => element.includes("Tag"));
      const reset = colortable.Reset;
      const out = "dbg_colors";
      if (!IS_NODE)
        console.groupCollapsed(out);
      colors.forEach((key) => {
        const color = colortable[key];
        const items = IS_NODE ? [`${padString(out)} - (node) ${color}${key}${reset}`] : [`(browser) %c${key}%c`, color, reset];
        console.log(...items);
      });
      if (!IS_NODE)
        console.groupEnd();
    }
    module2.exports = {
      TERM: TERM_COLORS,
      CSS: CSS_COLORS,
      padString,
      makeStyleFormatter: makeStyleFormatter2,
      makeErrorFormatter,
      makeWarningFormatter,
      dbgPrint,
      makeTerminalOut,
      makeHTMLConsole,
      printTagColors,
      colorTagString
    };
  }
});
var import_prompts = __toESM(require_prompts());
var { makeStyleFormatter } = import_prompts.default;
var PR = makeStyleFormatter("UR", "TagCyan");
function ClientTest() {
  console.log(...PR("System Integration of new URSYS module successful!"));
}

// _ur_addons/comment/ac-comment.ts
var ac_comment_exports = {};
__export(ac_comment_exports, {
  AddComment: () => AddComment2,
  CloseCommentCollection: () => CloseCommentCollection,
  GetComment: () => GetComment2,
  GetCommentCollection: () => GetCommentCollection,
  GetCommentCollections: () => GetCommentCollections,
  GetCommentTypes: () => GetCommentTypes2,
  GetCommentVObj: () => GetCommentVObj,
  GetDateString: () => GetDateString,
  GetThreadedViewObjects: () => GetThreadedViewObjects,
  GetThreadedViewObjectsCount: () => GetThreadedViewObjectsCount,
  GetUserName: () => GetUserName2,
  Init: () => Init2,
  RemoveComment: () => RemoveComment2,
  UpdateComment: () => UpdateComment2,
  UpdateCommentCollection: () => UpdateCommentCollection
});

// _ur_addons/comment/dc-comment.ts
var DBG = true;
var USERS = /* @__PURE__ */ new Map();
var COMMENTTYPES = /* @__PURE__ */ new Map();
var COMMENTS = /* @__PURE__ */ new Map();
var READBY = /* @__PURE__ */ new Map();
var ROOTS = /* @__PURE__ */ new Map();
var REPLY_ROOTS = /* @__PURE__ */ new Map();
var NEXT = /* @__PURE__ */ new Map();
var DB_Users;
var DB_CommentTypes;
var DB_Comments;
var LASTID = -1;
DB_Users = [
  { id: "Ben32", name: "BenL" },
  { id: "Sri64", name: "SriS" },
  { id: "Joshua11", name: "JoshuaD" }
];
DB_CommentTypes = [
  {
    id: "cmt",
    label: "COMMENT",
    // comment type label
    prompts: [
      {
        prompt: "COMMENT",
        // prompt label
        help: "",
        feedback: ""
      }
    ]
  },
  {
    id: "questionresponse",
    label: "Question or response",
    // comment type label
    prompts: [
      {
        prompt: "Question or response",
        // prompt label
        help: "",
        feedback: ""
      }
    ]
  },
  {
    id: "consistent",
    label: "Consistent",
    // comment type label
    prompts: [
      {
        prompt: "Consistent",
        // prompt label
        help: "",
        feedback: ""
      }
    ]
  },
  {
    id: "understandable",
    label: "Understandable",
    // comment type label
    prompts: [
      {
        prompt: "Understandable",
        // prompt label
        help: "",
        feedback: ""
      }
    ]
  },
  {
    id: "understandable",
    label: "Supported by evidence",
    // comment type label
    prompts: [
      {
        prompt: "Supported by evidence",
        // prompt label
        help: `It is important for a scientific model to be supported by evidence.

Does the evidence we have show that the model works this way?
Is there any contradictory evidence that says the model doesn't work this way?
`,
        feedback: "Consider pointing out relevant evidence by typing evidence #"
      }
    ]
  },
  {
    id: "changereason",
    label: "Change + Reason",
    // comment type label
    prompts: [
      {
        prompt: "Change",
        help: "What change do you want to make?",
        feedback: ""
      },
      {
        prompt: "Reason",
        help: "Why do you want to make that change",
        feedback: ""
      }
    ]
  },
  {
    id: "three",
    label: "Three Points",
    // comment type label
    prompts: [
      {
        prompt: "Point 1",
        help: "What change do you want to make?",
        feedback: ""
      },
      {
        prompt: "Point 2",
        help: "Why do you want to make that change",
        feedback: ""
      },
      {
        prompt: "Point 3",
        help: "Why do you want to make that change",
        feedback: ""
      }
    ]
  }
];
DB_Comments = [
  {
    collection_ref: "n1",
    comment_id: "1",
    // thread
    comment_id_parent: "",
    comment_id_previous: "",
    comment_type: "cmt",
    // no prompts
    comment_createtime: /* @__PURE__ */ new Date(),
    comment_modifytime: /* @__PURE__ */ new Date(),
    commenter_id: "Ben32",
    commenter_text: ["You're missing a citation."]
  },
  {
    collection_ref: "n1",
    comment_id: "2",
    // reply 1
    comment_id_parent: "1",
    comment_id_previous: "",
    comment_type: "changereason",
    comment_createtime: /* @__PURE__ */ new Date(),
    comment_modifytime: /* @__PURE__ */ new Date(),
    commenter_id: "Joshua11",
    commenter_text: [
      "I switched this to be fish die",
      "Because that's what the graph shows, thanks!"
    ]
  },
  {
    collection_ref: "n1",
    comment_id: "3",
    // reply 2
    comment_id_parent: "1",
    comment_id_previous: "2",
    comment_type: "understandable",
    // no prompts
    comment_createtime: /* @__PURE__ */ new Date(),
    comment_modifytime: /* @__PURE__ */ new Date(),
    commenter_id: "Ben32",
    commenter_text: ["OK nvm."]
  },
  {
    collection_ref: "n1",
    comment_id: "4",
    // thread
    comment_id_parent: "",
    comment_id_previous: "1",
    comment_type: "cmt",
    // no prompts
    comment_createtime: /* @__PURE__ */ new Date(),
    comment_modifytime: /* @__PURE__ */ new Date(),
    commenter_id: "Sri64",
    commenter_text: ["I don't think that's a good reason."]
  },
  {
    collection_ref: "n1",
    comment_id: "5",
    // reply 1
    comment_id_parent: "4",
    comment_id_previous: "",
    comment_type: "three",
    comment_createtime: /* @__PURE__ */ new Date(),
    comment_modifytime: /* @__PURE__ */ new Date(),
    commenter_id: "Ben32",
    commenter_text: [
      "I switched this to be fish die",
      "Because that's what the graph shows, thanks!",
      ""
    ]
  },
  {
    collection_ref: "n1",
    comment_id: "6",
    // thread
    comment_id_parent: "",
    comment_id_previous: "4",
    comment_type: "cmt",
    // no prompts
    comment_createtime: /* @__PURE__ */ new Date(),
    comment_modifytime: /* @__PURE__ */ new Date(),
    commenter_id: "Ben32",
    commenter_text: ["The last word."]
  },
  {
    collection_ref: "n2",
    comment_id: "7",
    // thread
    comment_id_parent: "",
    comment_id_previous: "",
    comment_type: "cmt",
    // no prompts
    comment_createtime: /* @__PURE__ */ new Date(),
    comment_modifytime: /* @__PURE__ */ new Date(),
    commenter_id: "Joshua11",
    commenter_text: ["A different object."]
  },
  {
    collection_ref: "e1",
    comment_id: "8",
    // thread
    comment_id_parent: "",
    comment_id_previous: "",
    comment_type: "cmt",
    // no prompts
    comment_createtime: /* @__PURE__ */ new Date(),
    comment_modifytime: /* @__PURE__ */ new Date(),
    commenter_id: "BenL",
    commenter_text: ["An edge comment."]
  }
];
function m_LoadUsers(dbUsers) {
  dbUsers.forEach((u) => USERS.set(u.id, u.name));
}
function m_LoadCommentTypes(commentTypes) {
  commentTypes.forEach((t) => COMMENTTYPES.set(t.id, t));
}
function m_LoadComments(comments) {
  let lastid = -1;
  comments.forEach((c) => {
    COMMENTS.set(c.comment_id, c);
    if (c.comment_id > lastid)
      lastid = c.comment_id;
  });
  LASTID = lastid;
}
function m_GetNextCommentId() {
  return ++LASTID;
}
function Init() {
  console.log("dc-comments Init");
  m_LoadCommentTypes(DB_CommentTypes);
  m_LoadUsers(DB_Users);
  m_LoadComments(DB_Comments);
  if (DBG)
    console.log("USERS", USERS);
  if (DBG)
    console.log("COMMENTTYPES", COMMENTTYPES);
  if (DBG)
    console.log("COMMENTS", COMMENTS);
  m_DeriveValues();
}
function GetUsers() {
  return USERS;
}
function GetUser(uid) {
  return USERS.get(uid);
}
function GetUserName(uid) {
  const u = USERS.get(uid);
  return u !== void 0 ? u : uid;
}
function GetCurrentUser() {
  return "Ben32";
}
function GetCommentTypes() {
  return COMMENTTYPES;
}
function GetCommentType(typeid) {
  return COMMENTTYPES.get(typeid);
}
function GetComments() {
  return COMMENTS;
}
function GetComment(cid) {
  return COMMENTS.get(cid);
}
function m_DeriveValues() {
  COMMENTS.forEach((c) => {
    if (c.comment_id_parent === "" && c.comment_id_previous === "")
      ROOTS.set(c.collection_ref, c.comment_id);
    if (c.comment_id_parent !== "" && c.comment_id_previous === "")
      REPLY_ROOTS.set(c.comment_id_parent, c.comment_id);
    NEXT.set(c.comment_id_previous, c.comment_id);
  });
  if (DBG)
    console.log("ROOTS", ROOTS);
  if (DBG)
    console.log("REPLY_ROOTS", REPLY_ROOTS);
  if (DBG)
    console.log("NEXT", NEXT);
}
function AddComment(data) {
  if (data.cref === void 0)
    throw new Error("Comments must have a collection ref!");
  const comment_id_parent = data.comment_id_parent || "";
  const comment_id_previous = data.comment_id_previous || "";
  const comment = {
    collection_ref: data.cref,
    comment_id: m_GetNextCommentId(),
    // thread
    comment_id_parent,
    comment_id_previous,
    comment_type: "cmt",
    // default type, no prompts
    comment_createtime: /* @__PURE__ */ new Date(),
    comment_modifytime: "",
    commenter_id: data.commenter_id,
    commenter_text: []
  };
  COMMENTS.set(comment.comment_id, comment);
  m_DeriveValues();
  return comment;
}
function RemoveComment(cid) {
  COMMENTS.delete(cid);
  m_DeriveValues();
}
function UpdateComment(cobj) {
  cobj.comment_modifytime = /* @__PURE__ */ new Date();
  COMMENTS.set(cobj.comment_id, cobj);
  console.log("...modify time", cobj.comment_modifytime);
}
function MarkCommentRead(cid, uid) {
  const readby = READBY.get(cid) || [];
  if (!readby.includes(uid))
    readby.push(uid);
  READBY.set(cid, readby);
}
function IsMarkedRead(cid, uid) {
  const readby = READBY.get(cid) || [];
  return readby.includes(uid);
}
function GetThreadedCommentIds(cref) {
  console.log("looking up cref", cref, typeof cref);
  const anchor_comment_ids = [];
  const all_comments_ids = [];
  const rootId = ROOTS.get(cref);
  if (rootId === void 0)
    return [];
  anchor_comment_ids.push(rootId);
  function getNext(cid) {
    const nextId = NEXT.get(cid);
    if (nextId)
      return [nextId, ...getNext(nextId)];
    return [];
  }
  anchor_comment_ids.push(...getNext(rootId));
  anchor_comment_ids.forEach((cid) => {
    const reply_root_id = REPLY_ROOTS.get(cid);
    if (reply_root_id) {
      all_comments_ids.push(cid, reply_root_id, ...getNext(reply_root_id));
    } else
      all_comments_ids.push(cid);
  });
  return all_comments_ids;
}
if (DBG)
  console.log("GetThreadedView", GetThreadedCommentIds("1"));
if (DBG)
  console.log("GetThreadedView", GetThreadedCommentIds("2"));
function GetThreadedCommentData(cref) {
  const all_comments_ids = GetThreadedCommentIds(cref);
  return all_comments_ids.map((cid) => COMMENTS.get(cid));
}
var dc_comment_default = {
  Init,
  // USERS
  GetUsers,
  GetUser,
  GetUserName,
  GetCurrentUser,
  // COMMENT TYPES
  GetCommentTypes,
  GetCommentType,
  // COMMENTS
  GetComments,
  GetComment,
  AddComment,
  RemoveComment,
  UpdateComment,
  MarkCommentRead,
  IsMarkedRead,
  GetThreadedCommentIds,
  GetThreadedCommentData
};

// _ur_addons/comment/ac-comment.ts
var DBG2 = true;
var COMMENTCOLLECTION = /* @__PURE__ */ new Map();
var COMMENTVOBJS = /* @__PURE__ */ new Map();
function Init2() {
  if (DBG2)
    console.log("ac-comments Init");
  dc_comment_default.Init();
}
function GetDateString(ms) {
  return new Date(ms).toLocaleString();
}
function GetCommentCollections() {
  return COMMENTCOLLECTION;
}
function GetCommentCollection(cref) {
  const collection = COMMENTCOLLECTION.get(cref);
  return collection;
}
function UpdateCommentCollection(updatedCCol) {
  const ccol = COMMENTCOLLECTION.get(updatedCCol.cref);
  ccol.isOpen = updatedCCol.isOpen;
  COMMENTCOLLECTION.set(ccol.cref, ccol);
}
function CloseCommentCollection(cref, uid) {
  const ccol = COMMENTCOLLECTION.get(cref);
  ccol.isOpen = false;
  COMMENTCOLLECTION.set(ccol.cref, ccol);
  const commentVObjs = COMMENTVOBJS.get(cref);
  commentVObjs.forEach((c) => dc_comment_default.MarkCommentRead(c.comment_id, uid));
  m_DeriveThreadedViewObjects(cref, uid);
}
function m_DeriveThreadedViewObjects(cref, uid) {
  const commentVObjs = [];
  const threadIds = dc_comment_default.GetThreadedCommentIds(cref);
  threadIds.forEach((cid) => {
    const comment = dc_comment_default.GetComment(cid);
    if (comment === void 0)
      console.error("GetThreadedViewObjects for cid not found", cid, "in", threadIds);
    const level = comment.comment_id_parent === "" ? 0 : 1;
    commentVObjs.push({
      comment_id: cid,
      createtime_string: GetDateString(comment.comment_createtime),
      modifytime_string: comment.comment_modifytime ? GetDateString(comment.comment_modifytime) : "",
      level,
      isSelected: false,
      isBeingEdited: false,
      isEditable: false,
      isMarkedRead: dc_comment_default.IsMarkedRead(cid, uid),
      allowReply: void 0
      // will be defined next
    });
  });
  const reversedCommentVObjs = commentVObjs.reverse();
  const commentReplyVObj = [];
  let prevLevel = -1;
  reversedCommentVObjs.forEach((cvobj) => {
    if (cvobj.level > prevLevel)
      cvobj.allowReply = true;
    commentReplyVObj.push(cvobj);
    prevLevel = cvobj.level;
  });
  COMMENTVOBJS.set(cref, commentReplyVObj.reverse());
  const hasReadComments = commentReplyVObj.length > 0;
  let hasUnreadComments = false;
  commentReplyVObj.forEach((c) => {
    if (!c.isMarkedRead)
      hasUnreadComments = true;
  });
  const ccol = {
    collection_ref: cref,
    hasUnreadComments,
    hasReadComments,
    isOpen: false
  };
  COMMENTCOLLECTION.set(cref, ccol);
  return commentReplyVObj;
}
function GetThreadedViewObjects(cref, uid) {
  const commentVObjs = COMMENTVOBJS.get(cref);
  return commentVObjs === void 0 ? m_DeriveThreadedViewObjects(cref, uid) : commentVObjs;
}
function GetThreadedViewObjectsCount(cref, uid) {
  return GetThreadedViewObjects(cref, uid).length;
}
function GetCommentVObj(cref, cid) {
  console.log("COMMENTVOBJS", cref, cid, JSON.stringify(COMMENTVOBJS));
  const thread = COMMENTVOBJS.get(cref);
  const comment = thread.find((c) => c.comment_id === cid);
  return comment;
}
function AddComment2(data) {
  if (data.cref === void 0)
    throw new Error("Comments must have a collection ref!");
  const comment = dc_comment_default.AddComment(data);
  m_DeriveThreadedViewObjects(data.cref, data.commenter_id);
  let commentVObjs = GetThreadedViewObjects(data.cref, data.commenter_id);
  const cvobj = GetCommentVObj(comment.collection_ref, comment.comment_id);
  cvobj.isBeingEdited = true;
  commentVObjs = commentVObjs.map(
    (c) => c.comment_id === cvobj.comment_id ? cvobj : c
  );
  COMMENTVOBJS.set(data.cref, commentVObjs);
  let ccol = GetCommentCollection(data.cref);
  ccol.isOpen = true;
  COMMENTCOLLECTION.set(data.cref, ccol);
  return comment;
}
function RemoveComment2(cid) {
  dc_comment_default.RemoveComment(cid);
}
function UpdateComment2(cobj) {
  dc_comment_default.UpdateComment(cobj);
  let commentVObjs = GetThreadedViewObjects(cobj.collection_ref, cobj.commenter_id);
  const cvobj = GetCommentVObj(cobj.collection_ref, cobj.comment_id);
  cvobj.isBeingEdited = false;
  cvobj.modifytime_string = GetDateString(cobj.comment_modifytime);
  console.log("......cvobj.modifytime_string", cvobj.modifytime_string);
  commentVObjs = commentVObjs.map(
    (c) => c.comment_id === cvobj.comment_id ? cvobj : c
  );
  COMMENTVOBJS.set(cobj.collection_ref, commentVObjs);
  console.log("........COMMENTVOBJS", COMMENTVOBJS);
}
function GetUserName2(uid) {
  return dc_comment_default.GetUserName(uid);
}
function GetCommentTypes2() {
  return dc_comment_default.GetCommentTypes();
}
function GetComment2(cid) {
  return dc_comment_default.GetComment(cid);
}

// _ur_addons/@addons-client.ts
var { ConsoleStyler } = client_esm_exports;
var PF = ConsoleStyler("UR/ADD", "TagPink");
function AddonClientTest() {
  console.log(...PF("System Integration of new URSYS addon successful!"));
}
//# sourceMappingURL=addons-client-cjs.js.map
  })();
});

require.register("@ursys/core/_dist/client-cjs.js", function(exports, require, module) {
  require = __makeRelativeRequire(require, {}, "@ursys/core");
  (function() {
    var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// _ur/common/declare-console.js
var require_declare_console = __commonJS({
  "_ur/common/declare-console.js"(exports, module2) {
    var TERM_COLORS = {
      // TOUT = makeTerminalOut(str); TOUT('hi')
      Reset: "\x1B[0m",
      Bright: "\x1B[1m",
      Dim: "\x1B[2m",
      Underscore: "\x1B[4m",
      Blink: "\x1B[5m",
      Reverse: "\x1B[7m",
      Hidden: "\x1B[8m",
      //
      Black: "\x1B[30m",
      White: "\x1B[37m",
      Red: "\x1B[31m",
      Orange: "\x1B[38;5;202m",
      Yellow: "\x1B[33m",
      Green: "\x1B[32m",
      Cyan: "\x1B[36m",
      Blue: "\x1B[34m",
      Purple: "\x1B[35m",
      //
      BgBlack: "\x1B[40m",
      BgGray: "\x1B[100m",
      BgWhite: "\x1B[47m",
      BgRed: "\x1B[41m",
      BgOrange: "\x1B[48;5;202m",
      BgYellow: "\x1B[43m",
      BgCyan: "\x1B[46m",
      BgGreen: "\x1B[42m",
      BgBlue: "\x1B[44m",
      BgPurple: "\x1B[45m",
      BgPink: "\x1B[105m",
      // FORMATS
      TagBlack: "\x1B[30;1m",
      TagWhite: "\x1B[37;1m",
      TagRed: "\x1B[41;37m",
      TagOrange: "\x1B[43;37m",
      TagYellow: "\x1B[43;30m",
      TagGreen: "\x1B[42;30m",
      TagCyan: "\x1B[46;37m",
      TagBlue: "\x1B[44;37m",
      TagPurple: "\x1B[45;37m",
      TagPink: "\x1B[105;1m",
      TagGray: "\x1B[100;37m",
      TagNull: "\x1B[2;37m"
    };
    var CSS_COMMON = "padding:3px 5px;border-radius:2px;";
    var CSS_COLORS = {
      Reset: "color:auto;background-color:auto",
      // COLOR FOREGROUND
      Black: "color:black",
      White: "color:white",
      Red: "color:red",
      Orange: "color:orange",
      Yellow: "color:orange",
      Green: "color:green",
      Cyan: "color:cyan",
      Blue: "color:blue",
      Magenta: "color:magenta",
      Pink: "color:pink",
      // COLOR BACKGROUND
      TagRed: `color:#000;background-color:#f66;${CSS_COMMON}`,
      TagOrange: `color:#000;background-color:#fa4;${CSS_COMMON}`,
      TagYellow: `color:#000;background-color:#fd4;${CSS_COMMON}`,
      TagGreen: `color:#000;background-color:#5c8;${CSS_COMMON}`,
      TagCyan: `color:#000;background-color:#2dd;${CSS_COMMON}`,
      TagBlue: `color:#000;background-color:#2bf;${CSS_COMMON}`,
      TagPurple: `color:#000;background-color:#b6f;${CSS_COMMON}`,
      TagPink: `color:#000;background-color:#f9f;${CSS_COMMON}`,
      TagGray: `color:#fff;background-color:#999;${CSS_COMMON}`,
      TagNull: `color:#999;border:1px solid #ddd;${CSS_COMMON}`,
      // COLOR BACKGROUND DARK (BROWSER ONLY)
      TagDkRed: `color:white;background-color:maroon;${CSS_COMMON}`,
      TagDkOrange: `color:white;background-color:burntorange;${CSS_COMMON}`,
      TagDkYellow: `color:white;background-color:brown;${CSS_COMMON}`,
      TagDkGreen: `color:white;background-color:forestgreen;${CSS_COMMON}`,
      TagDkCyan: `color:white;background-color:cerulean;${CSS_COMMON}`,
      TagDkBlue: `color:white;background-color:darkblue;${CSS_COMMON}`,
      TagDkPurple: `color:white;background-color:indigo;${CSS_COMMON}`,
      TagDkPink: `color:white;background-color:fuchsia;${CSS_COMMON}`
    };
    TERM_COLORS.TagBuild = TERM_COLORS.TagGray;
    TERM_COLORS.TagError = TERM_COLORS.TagRed;
    TERM_COLORS.TagAlert = TERM_COLORS.TagOrange;
    TERM_COLORS.TagTest = TERM_COLORS.TagRed;
    TERM_COLORS.TagSystem = TERM_COLORS.TagGray;
    TERM_COLORS.TagServer = TERM_COLORS.TagGray;
    TERM_COLORS.TagDatabase = TERM_COLORS.TagCyan;
    TERM_COLORS.TagNetwork = TERM_COLORS.TagCyan;
    TERM_COLORS.TagUR = TERM_COLORS.TagBlue;
    TERM_COLORS.TagURNET = TERM_COLORS.TagBlue;
    TERM_COLORS.TagURMOD = TERM_COLORS.TagBlue;
    TERM_COLORS.TagAppMain = TERM_COLORS.TagGreen;
    TERM_COLORS.TagAppModule = TERM_COLORS.TagGreen;
    TERM_COLORS.TagAppState = TERM_COLORS.TagGreen;
    TERM_COLORS.TagAppCore = TERM_COLORS.TagGreen;
    TERM_COLORS.TagDataCore = TERM_COLORS.TagGreen;
    TERM_COLORS.TagUI = TERM_COLORS.TagPurple;
    TERM_COLORS.TagPhase = TERM_COLORS.TagPink;
    TERM_COLORS.TagEvent = TERM_COLORS.TagPink;
    TERM_COLORS.TagStream = TERM_COLORS.TagPink;
    CSS_COLORS.TagDebug = `color:#fff;background-color:IndianRed;${CSS_COMMON}`;
    CSS_COLORS.TagWarning = `color:#fff;background:linear-gradient(
  -45deg,
  rgb(29,161,242),
  rgb(184,107,107),
  rgb(76,158,135)
);${CSS_COMMON}`;
    CSS_COLORS.TagTest = CSS_COLORS.TagRed;
    CSS_COLORS.TagSystem = CSS_COLORS.TagGray;
    CSS_COLORS.TagServer = CSS_COLORS.TagGray;
    CSS_COLORS.TagDatabase = CSS_COLORS.TagCyan;
    CSS_COLORS.TagNetwork = CSS_COLORS.TagCyan;
    CSS_COLORS.TagUR = `color:CornflowerBlue;border:1px solid CornflowerBlue;${CSS_COMMON}`;
    CSS_COLORS.TagURNET = `color:#fff;background-color:MediumSlateBlue;${CSS_COMMON}`;
    CSS_COLORS.TagURMOD = `color:#fff;background:linear-gradient(
  -45deg,
  CornflowerBlue 0%,
  LightSkyBlue 25%,
  RoyalBlue 100%
);${CSS_COMMON}`;
    CSS_COLORS.TagAppMain = CSS_COLORS.TagGreen;
    CSS_COLORS.TagAppModule = CSS_COLORS.TagGreen;
    CSS_COLORS.TagAppState = `color:#fff;background-color:Navy;${CSS_COMMON}`;
    CSS_COLORS.TagUI = CSS_COLORS.TagDkOrange;
    CSS_COLORS.TagEvent = CSS_COLORS.TagDkOrange;
    CSS_COLORS.TagStream = CSS_COLORS.TagDkOrange;
    CSS_COLORS.TagPhase = `color:#fff;background-color:MediumVioletRed;${CSS_COMMON}`;
    module2.exports = {
      TERM_COLORS,
      CSS_COLORS
    };
  }
});

// _ur/common/prompts.js
var require_prompts = __commonJS({
  "_ur/common/prompts.js"(exports, module2) {
    var IS_NODE = typeof window === "undefined";
    var IS_MOBILE = !IS_NODE && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    var D_CONSOLE = require_declare_console();
    var { TERM_COLORS, CSS_COLORS } = D_CONSOLE;
    var DEFAULT_PADDING = IS_NODE ? 10 : 8;
    var DEFAULT_SPACE = IS_NODE ? " ".padStart(DEFAULT_PADDING, " ") : " ".padStart(DEFAULT_PADDING + 4, " ");
    var DEFAULT_COLOR = "TagNull";
    var HTCONSOLES = {};
    var SHOW = true;
    var PROMPT_DICT = {
      // URSYS-RELATED MODULES
      "UR": [SHOW, "TagRed"],
      // SERVERS
      "APPSRV": [SHOW, "Yellow"],
      "GEMSRV": [SHOW, "Yellow"],
      // SPECIAL
      "-": [SHOW, "TagNull"]
    };
    function padString(str, padding = DEFAULT_PADDING) {
      let len = str.length;
      const nbsp = String.fromCharCode(160);
      if (IS_NODE)
        return `${str.padEnd(padding, " ")}`;
      if (padding === 0)
        return `${str}`;
      if (len >= padding)
        str = str.substr(0, padding);
      else
        str = str.padEnd(padding, nbsp);
      return `${str}`;
    }
    function m_SetPromptColors(match, color = DEFAULT_COLOR) {
      if (typeof match !== "string")
        throw Error("match prompt must be string");
      match = match.trim();
      if (match === "")
        throw Error("match prompt cannot be empty");
      let colorTable = IS_NODE ? TERM_COLORS : CSS_COLORS;
      let validColor = false;
      validColor = colorTable[color] !== void 0;
      if (!validColor)
        colorTable = IS_NODE ? CSS_COLORS : TERM_COLORS;
      validColor = colorTable[color] !== void 0;
      if (!validColor)
        throw Error(`prompt color ${color} is not defined in either table`);
      PROMPT_DICT[match] = [true, color];
      return colorTable;
    }
    function m_GetEnvColor(prompt, tagColor) {
      const colorTable = m_SetPromptColors(prompt, tagColor);
      const [dbg_mode, defcol] = PROMPT_DICT[prompt.trim()] || [SHOW, DEFAULT_COLOR];
      const ucolor = colorTable[tagColor];
      const dcolor = colorTable[defcol];
      const color = ucolor || dcolor;
      const reset = colorTable.Reset;
      return [dbg_mode, color, reset];
    }
    function m_MakeColorArray(prompt, colorName) {
      const [dbg, color, reset] = m_GetEnvColor(prompt, colorName);
      if (!(dbg || IS_NODE))
        return [];
      return IS_NODE ? [`${color}${padString(prompt)}${reset}   `] : [`%c${padString(prompt)}%c `, color, reset];
    }
    function m_MakeColorPromptFunction(prompt, colorName, opt = {}) {
      const textColor = opt.color || "Reset";
      const dim = opt.dim || false;
      return IS_NODE ? (str, ...args) => {
        if (args === void 0)
          args = "";
        let TAG = TERM_COLORS[colorName];
        let TEXT = TERM_COLORS[textColor];
        let RST = TERM_COLORS.Reset;
        let PR2 = padString(prompt);
        if (dim)
          TEXT += TERM_COLORS.Dim;
        console.log(`${RST}${TAG}${PR2}${RST}${TEXT}    ${str}`, ...args);
      } : (str, ...args) => {
        if (args === void 0)
          args = "";
        let TEXT = TERM_COLORS[textColor];
        let RST = CSS_COLORS.Reset;
        let PR2 = padString(prompt);
        console.log(`%c${PR2}%c%c ${str}`, RST, TEXT, ...args);
      };
    }
    function m_GetDivText(id) {
      const el = document.getElementById(id);
      if (!el) {
        console.log(`GetDivText: element ${id} does not exist`);
        return void 0;
      }
      const text = el.textContent;
      if (text === void 0) {
        console.log(`HTMLTextOut: element ${id} does not have textContent`);
        return {};
      }
      el.style.whiteSpace = "pre";
      el.style.fontFamily = "monospace";
      return { element: el, text };
    }
    function m_HTMLTextJumpRow(row, lineBuffer, id) {
      const { element, text } = m_GetDivText(id);
      if (text === void 0)
        return lineBuffer;
      if (lineBuffer.length === 0) {
        console.log(`initializing linebuffer from element id='${id}'`);
        lineBuffer = text.split("\n");
      }
      if (row > lineBuffer.length - 1) {
        const count = row + 1 - lineBuffer.length;
        for (let i = count; i > 0; i--)
          lineBuffer.push("");
      }
      return lineBuffer;
    }
    function m_HTMLTextPrint(str = "", lineBuffer, id) {
      const { element, text } = m_GetDivText(id);
      if (!text)
        return lineBuffer;
      lineBuffer.push(str);
      element.textContent = lineBuffer.join("\n");
      return lineBuffer;
    }
    function m_HTMLTextPlot(str = "", lineBuffer, id, row = 0, col = 0) {
      const { element, text } = m_GetDivText(id);
      if (!element)
        return lineBuffer;
      if (text === void 0) {
        console.log(`HTMLTextOut: element ${id} does not have textContent`);
        return lineBuffer;
      }
      lineBuffer = m_HTMLTextJumpRow(row, lineBuffer, id);
      let line = lineBuffer[row];
      if (line === void 0) {
        console.log(`HTMLTextOut: unexpected line error for line ${row}`);
        return lineBuffer;
      }
      if (col + str.length > line.length + str.length) {
        for (let i = 0; i < col + str.length - line.length; i++)
          line += " ";
      }
      let p1 = line.substr(0, col);
      let p3 = line.substr(col + str.length, line.length - (col + str.length));
      lineBuffer[row] = `${p1}${str}${p3}`;
      element.textContent = lineBuffer.join("\n");
      return lineBuffer;
    }
    function makeStyleFormatter2(prompt, tagColor) {
      if (prompt.startsWith("UR") && tagColor === void 0)
        tagColor = "TagUR";
      let outArray = m_MakeColorArray(prompt, tagColor);
      if (outArray.length === 0)
        return () => [];
      if (IS_MOBILE)
        outArray = [`${prompt}:`];
      const f = (str, ...args) => [...outArray, str, ...args];
      f._ = `
${DEFAULT_SPACE}`;
      return f;
    }
    function makeErrorFormatter(pr = "") {
      const bg = "rgba(255,0,0,1)";
      const bga = "rgba(255,0,0,0.15)";
      pr = `ERROR ${pr}`.trim();
      return (str, ...args) => [
        `%c${pr}%c${str}`,
        `color:#fff;background-color:${bg};padding:3px 7px 3px 10px;border-radius:10px 0 0 10px;`,
        `color:${bg};background-color:${bga};padding:3px 5px;`,
        ...args
      ];
    }
    function makeWarningFormatter(pr = "") {
      const bg = "rgba(255,150,0,1)";
      const bga = "rgba(255,150,0,0.15)";
      pr = `WARN ${pr}`.trim();
      return (str, ...args) => [
        `%c${pr}%c${str}`,
        `color:#fff;background-color:${bg};padding:3px 7px 3px 10px;border-radius:10px 0 0 10px;`,
        `color:${bg};background-color:${bga};padding:3px 5px;`,
        ...args
      ];
    }
    function dbgPrint(pr, bg = "MediumVioletRed") {
      return [
        `%c${pr}%c`,
        `color:#fff;background-color:${bg};padding:3px 10px;border-radius:10px;`,
        "color:auto;background-color:auto"
      ];
    }
    function colorTagString(str, tagColor) {
      return m_MakeColorArray(str, tagColor);
    }
    function makeTerminalOut(prompt, tagColor = DEFAULT_COLOR) {
      const wrap = m_MakeColorPromptFunction(prompt, tagColor);
      wrap.warn = m_MakeColorPromptFunction(prompt, "TagYellow", { color: "Yellow" });
      wrap.error = m_MakeColorPromptFunction(prompt, "TagRed", { color: "Red" });
      wrap.info = m_MakeColorPromptFunction(prompt, "TagGray", { dim: true });
      wrap.DIM = "\x1B[2m";
      wrap.BRI = "\x1B[1m";
      wrap.RST = "\x1B[0m";
      return wrap;
    }
    function makeHTMLConsole(divId, row = 0, col = 0) {
      const ERP = makeStyleFormatter2("makeHTMLConsole", "Red");
      let buffer = [];
      if (typeof divId !== "string")
        throw Error("bad id");
      if (!document.getElementById(divId)) {
        console.warn(...ERP(`id '${divId}' doesn't exist`));
        return {
          print: () => {
          },
          plot: () => {
          },
          clear: () => {
          },
          gotoRow: () => {
          }
        };
      }
      let hcon;
      if (HTCONSOLES[divId]) {
        hcon = HTCONSOLES[divId];
      } else {
        hcon = {
          buffer: [],
          plot: (str, y = row, x = col) => {
            buffer = m_HTMLTextPlot(str, buffer, divId, y, x);
          },
          print: (str) => {
            buffer = m_HTMLTextPrint(str, buffer, divId);
          },
          clear: (startRow = 0, endRow = buffer.length) => {
            buffer.splice(startRow, endRow);
          },
          gotoRow: (row2) => {
            buffer = m_HTMLTextJumpRow(row2, buffer, divId);
          }
        };
        HTCONSOLES[divId] = hcon;
      }
      return hcon;
    }
    function printTagColors() {
      const colortable = IS_NODE ? TERM_COLORS : CSS_COLORS;
      const colors = Object.keys(colortable).filter((element) => element.includes("Tag"));
      const reset = colortable.Reset;
      const out = "dbg_colors";
      if (!IS_NODE)
        console.groupCollapsed(out);
      colors.forEach((key) => {
        const color = colortable[key];
        const items = IS_NODE ? [`${padString(out)} - (node) ${color}${key}${reset}`] : [`(browser) %c${key}%c`, color, reset];
        console.log(...items);
      });
      if (!IS_NODE)
        console.groupEnd();
    }
    module2.exports = {
      TERM: TERM_COLORS,
      CSS: CSS_COLORS,
      padString,
      makeStyleFormatter: makeStyleFormatter2,
      makeErrorFormatter,
      makeWarningFormatter,
      dbgPrint,
      makeTerminalOut,
      makeHTMLConsole,
      printTagColors,
      colorTagString
    };
  }
});

// _ur/browser-client/@client.ts
var client_exports = {};
__export(client_exports, {
  ClientTest: () => ClientTest,
  ConsoleStyler: () => makeStyleFormatter
});
module.exports = __toCommonJS(client_exports);
var import_prompts = __toESM(require_prompts());
var { makeStyleFormatter } = import_prompts.default;
var PR = makeStyleFormatter("UR", "TagCyan");
function ClientTest() {
  console.log(...PR("System Integration of new URSYS module successful!"));
}
//# sourceMappingURL=client-cjs.js.map
  })();
});
require.alias("@ursys/addons/_dist/addons-client-cjs.js", "@ursys/addons");
require.alias("@ursys/core/_dist/client-cjs.js", "@ursys/core");
require.alias("assert/assert.js", "assert");
require.alias("buffer/index.js", "buffer");
require.alias("crypto-browserify/index.js", "crypto");
require.alias("events/events.js", "events");
require.alias("stream-http/index.js", "http");
require.alias("https-browserify/index.js", "https");
require.alias("os-browserify/browser.js", "os");
require.alias("path-browserify/index.js", "path");
require.alias("process/browser.js", "process");
require.alias("punycode/punycode.js", "punycode");
require.alias("querystring-es3/index.js", "querystring");
require.alias("stream-browserify/index.js", "stream");
require.alias("node-browser-modules/node_modules/string_decoder/index.js", "string_decoder");
require.alias("util/util.js", "sys");
require.alias("url/url.js", "url");process = require('process');require.register("___globals___", function(exports, require, module) {
  

// Auto-loaded modules from config.npm.globals.
window.jquery = require("jquery");


});})();require('___globals___');


//# sourceMappingURL=ursys-lib.js.map