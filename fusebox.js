/*  Fuse JavaScript framework, version Alpha
 *  (c) 2008-2010 John-David Dalton
 *
 *  FuseJS is freely distributable under the terms of an MIT-style license.
 *  For details, see the FuseJS web site: http://www.fusejs.com/
 *
 *--------------------------------------------------------------------------*/

(function(global) {

  var CLEANED_ACTIVEX, IS_MAP_CORRUPT, MODE,

  cache = [ ],

  counter = 1,

  doc = global.document,

  uid = 'uid' + (new Date).getTime(),

  // Host objects have a range of typeof values such as
  // typeof document.createElement('div').offsetParent -> unknown
  // typeof document.createElement -> object
  isHostType = function(object, property) {
    var type = typeof object[property];
    return type === 'object' ? !!object[property] : !NON_HOST_TYPES[type];
  },

  ACTIVEX_MODE = 1,

  PROTO_MODE   = 2,

  IFRAME_MODE  = 3,

  IDENTITY = function(x) { return x; },

  NON_HOST_TYPES = { 'boolean': 1, 'number': 1, 'string': 1, 'undefined': 1 },

  HAS_ACTIVEX = (function() {
    try {
      // ensure ActiveX is enabled
      return !!new ActiveXObject('htmlfile');
    } catch (e) {
      return false;
    }
  })(),

  HAS_IFRAME = doc && isHostType(doc, 'createElement') &&
    isHostType(global, 'frames') && 'src' in doc.createElement('iframe'),

  HAS_PROTO = (function() {
    // true for Gecko and Webkit
    var result = false, arr = [], obj = {}, backup = arr['__proto__'];
    if (arr['__proto__'] === Array.prototype  &&
        obj['__proto__'] === Object.prototype) {
      // test if it's writable and restorable
      arr['__proto__'] = obj;
      result = typeof arr.push === 'undefined';
      arr['__proto__'] = backup;
      return result && typeof arr.push === 'function';
    }
    return result;
  })(),

  Fusebox = function Fusebox(instance) {
    instance = createFusebox(instance);
    return postProcess(instance);
  },

  Klass = function() { },

  postProcess = IDENTITY,

  postProcessIframe = function(instance) {
    postProcess =
    postProcessIframe = function(instance) {
      var iframe = cache[cache.length - 1];
      iframe.parentNode.removeChild(iframe);
      return instance;
    };

    postProcessIframe(instance);

    return (function() {
      var errored, div = doc.createElement('div'),
       toString = instance.Object().toString;

      // Safari does not support sandboxed natives from iframes :(
      if (instance.Array().constructor === Array) {
        // move first iframe to trash
        errored = !!div.appendChild(cache.pop());
      }
      // Opera 9.5 - 10a throws a security error when calling Array#map or
      // String#lastIndexOf on sandboxed natives created on the file:// protocol.
      // 
      // Opera 9.5 - 9.64 will error by simply calling the methods.
      // Opera 10 will error when first accessing the contentDocument of
      // another iframe and then accessing the methods.
      else if (toString.call(instance.Array().map) === '[object Function]') {
        // create and remove second iframe
        postProcessIframe(createSandbox());
  
        // test to see if Array#map is corrupted
        try {
          instance.Array().map(NOOP);
        } catch (e) {
          // move iframe to trash
          IS_MAP_CORRUPT = errored = !!div.appendChild(cache.pop());
        }
        // move other iframe to trash
        div.appendChild(cache.pop());
      }

      div.innerHTML = '';
      return errored ? Fusebox(instance) : instance;
    })();
  },

  getMode = function() {
    return MODE;
  },

  setMode = function(mode) {
    MODE = +mode;
    postProcess = MODE === IFRAME_MODE ? postProcessIframe : IDENTITY;
  },

  createSandbox = function() {
    var iframe, key, name, parentNode, result, xdoc;

    switch (MODE) {
      case PROTO_MODE: return global;

      case ACTIVEX_MODE:
        // IE requires the iframe/htmlfile remain in the cache or
        // it will become corrupted
        (xdoc = new ActiveXObject('htmlfile')).open();
        xdoc.write('<script><\/script>');
        xdoc.close();
        cache.push(xdoc);

        // prevents a memory leak in IE
        // IE doesn't support bfcache so we don't have to worry about breaking it.
        if (!CLEANED_ACTIVEX) {
          CLEANED_ACTIVEX = true;
          if (isHostType(global, 'attachEvent')) {
            global.attachEvent('onunload', function() { cache.length = 0; });
          }
        }
        return xdoc.parentWindow;

      case IFRAME_MODE:
        key = '/* fusebox_iframe_cache_fix */';
        name = uid + counter++;
        parentNode = doc.body || doc.documentElement;

        try {
          // set name attribute for IE6/7
          iframe = doc.createElement('<iframe name="' + name + '">');
        } catch(e) {
          (iframe = doc.createElement('iframe')).name = name;
        }

        try {
          // Detect caching bug in Firefox 3.5+
          // A side effect is that Firefox will use the __proto__ technique
          // when served from the file:// protocol as well
          if ('MozOpacity' in doc.documentElement.style &&
              isHostType(global, 'sessionStorage') &&
              !global.sessionStorage[key]) {
            global.sessionStorage[key] = 1;
            throw new Error;
          }

          // IE / Opera 9.25 throw security errors when trying to write to an iframe
          // after the document.domain is set. Also Opera < 9 doesn't support
          // inserting an iframe into the document.documentElement.
          iframe.style.display = 'none';
          parentNode.insertBefore(iframe, parentNode.firstChild);

          result = global.frames[name];
          (xdoc = result.document).open();
          xdoc.write(
            // Firefox 3.5+ glitches when an iframe is inserted and removed,
            // from a page containing other iframes, before dom load.
            // When the page loads one of the other iframes on the page will have
            // its content swapped with our iframe. Though the content is swapped,
            // the iframe will persist its `src` property so we check if our
            // iframe has a src property and load it if found.
            '<script>var g=this,c=function(s){' +
            '(s=g.frameElement.src)&&g.location.replace(s);' +
            'if(g.parent.document.readyState!="complete"){g.setTimeout(c,10)}};' +
            'c()<\/script>');

          xdoc.close();
          cache.push(iframe);
          return result;
        }
        catch (e) {
          if (HAS_ACTIVEX) {
            setMode(ACTIVEX_MODE);
            return createSandbox();
          }
          if (HAS_PROTO) {
            setMode(PROTO_MODE);
            return createSandbox();
          }
          throw new Error('Fusebox failed to create a sandbox by iframe.');
        }
    }
    throw new Error('Fusebox failed to create a sandbox.');
  },

  createFusebox = function(instance) {
    // Most methods try to follow ES5 spec but may differ from
    // the documented method.length value or allow null callbacks.
    var Array, Boolean, Date, Function, Number, Object, RegExp, String, from, isFunction,
     filterCallback       = function(value) { return value != null; },
     glFunction           = global.Function,
     reStrict             = /^(?:\/\*+[\w|\W]*?\*\/|\/\/.*?[\n\r\u2028\u2029]|\s)*(["'])use strict\1/,
     sandbox              = createSandbox(),
     isProtoMode          = MODE === PROTO_MODE,
     isArrayChainable     = !isProtoMode && !(sandbox.Array().slice(0) instanceof global.Array),
     isRegExpChainable    = !isProtoMode && !(sandbox.RegExp('') instanceof global.RegExp),
     arrPlugin            = isProtoMode && new sandbox.Array    || sandbox.Array.prototype,
     boolPlugin           = isProtoMode && new sandbox.Boolean  || sandbox.Boolean.prototype,
     datePlugin           = isProtoMode && new sandbox.Date     || sandbox.Date.prototype,
     funcPlugin           = isProtoMode && new sandbox.Function || sandbox.Function.prototype,
     numPlugin            = isProtoMode && new sandbox.Number   || sandbox.Number.prototype,
     regPlugin            = isProtoMode && new sandbox.RegExp   || sandbox.RegExp.prototype,
     strPlugin            = isProtoMode && new sandbox.String   || sandbox.String.prototype,
     objPlugin            = sandbox.Object.prototype,
     toString             = objPlugin.toString,
     __Array              = sandbox.Array,
     __Boolean            = sandbox.Boolean,
     __Date               = sandbox.Date,
     __Function           = sandbox.Function,
     __Number             = sandbox.Number,
     __Object             = sandbox.Object,
     __RegExp             = sandbox.RegExp,
     __String             = sandbox.String;
     __concat             = arrPlugin.concat,
     __every              = arrPlugin.every,
     __filter             = arrPlugin.filter,
     __join               = arrPlugin.join,
     __indexOf            = arrPlugin.indexOf,
     __lastIndexOf        = arrPlugin.lastIndexOf,
     __map                = arrPlugin.map,
     __push               = arrPlugin.push,
     __reverse            = arrPlugin.reverse,
     __slice              = arrPlugin.slice,
     __splice             = arrPlugin.splice,
     __some               = arrPlugin.some,
     __sort               = arrPlugin.sort,
     __unshift            = arrPlugin.unshift,
     __getDate            = datePlugin.getDate,
     __getDay             = datePlugin.getDay,
     __getFullYear        = datePlugin.getFullYear,
     __getHours           = datePlugin.getHours,
     __getMilliseconds    = datePlugin.getMilliseconds,
     __getMinutes         = datePlugin.getMinutes,
     __getMonth           = datePlugin.getMonth,
     __getSeconds         = datePlugin.getSeconds,
     __getTime            = datePlugin.getTime,
     __getTimezoneOffset  = datePlugin.getTimezoneOffset,
     __getUTCDate         = datePlugin.getUTCDate,
     __getUTCDay          = datePlugin.getUTCDay,
     __getUTCFullYear     = datePlugin.getUTCFullYear,
     __getUTCHours        = datePlugin.getUTCHours,
     __getUTCMilliseconds = datePlugin.getUTCMilliseconds,
     __getUTCMinutes      = datePlugin.getUTCMinutes,
     __getUTCMonth        = datePlugin.getUTCMonth,
     __getUTCSeconds      = datePlugin.getUTCSeconds,
     __getYear            = datePlugin.getYear,
     __toISOString        = datePlugin.toISOString,
     __toJSON             = datePlugin.toJSON,
     __toExponential      = numPlugin.toExponential,
     __toFixed            = numPlugin.toFixed,
     __toPrecision        = numPlugin.toPrecision,
     __exec               = regPlugin.exec,
     __charAt             = strPlugin.charAt,
     __charCodeAt         = strPlugin.charCodeAt,
     __strConcat          = strPlugin.concat,
     __strIndexOf         = strPlugin.indexOf,
     __localeCompare      = strPlugin.localeCompare,
     __match              = strPlugin.match,
     __replace            = strPlugin.replace,
     __search             = strPlugin.search,
     __strSlice           = strPlugin.slice,
     __substr             = strPlugin.substr,
     __substring          = strPlugin.substring,
     __toLowerCase        = strPlugin.toLowerCase,
     __toLocaleLowerCase  = strPlugin.toLocaleLowerCase,
     __toLocaleUpperCase  = strPlugin.toLocaleUpperCase,
     __toUpperCase        = strPlugin.toUpperCase,
     __trim               = strPlugin.trim,
     __trimLeft           = strPlugin.trimLeft,
     __trimRight          = strPlugin.trimRight,
     __split              = ''.split,
     __strLastIndexOf     = ''.lastIndexOf;

    instance || (instance = new Klass);

    isFunction = function isFunction(value) {
      return toString.call(value) === '[object Function]';
    };

    from = function(value) {
      var classOf = toString.call(value);
      switch (classOf) {
        case '[object Array]':
          if (value.constructor !== instance.Array) {
            return instance.Array.fromArray(value);
          }
          break;

        case '[object Boolean]':
          if (value.constructor !== instance.Boolean) {
            return instance.Boolean(value == true);
          }
          break;

        case '[object Date]':
          if (value.constructor !== instance.Date) {
            return instance.Date(+value);
          }
          break;

        case '[object RegExp]':
          if (value.constructor !== instance.RegExp) {
            return instance.RegExp(value.source,
              (value.global     ? 'g' : '') +
              (value.ignoreCase ? 'i' : '') +
              (value.multiline  ? 'm' : ''));
          }
          break;

        case '[object Number]' :
        case '[object String]' :
          classOf = classOf.slice(8,-1);
          if (value.constructor !== instance[classOf]) {
            return instance[classOf](value);
          }
      }
      return value;
    };


    /*------------------------- CREATE CONSTRUCTORS --------------------------*/

    if (isProtoMode) {
      Array = function Array(length) {
        var result = [], argLen = arguments.length;
        if (argLen) {
          if (argLen === 1 && length === length >>> 0) {
            result.length = length;
          } else {
            result.push.apply(result, arguments);
          }
        }
        result.__proto__ = arrPlugin;
        return result;
      };

      Boolean = function Boolean(value) {
        var result = new __Boolean(value);
        result['__proto__'] = boolPlugin;
        return result;
      };

      Date = function Date(year, month, date, hours, minutes, seconds, ms) {
        var result;
        if (this.constructor === Date) {
          result = arguments.length === 1
            ? new __Date(year)
            : new __Date(year, month, date || 1, hours || 0, minutes || 0, seconds || 0, ms || 0);
          result['__proto__'] = datePlugin;
        } else {
          result = instance.String(new __Date);
        }
        return result;
      };

      Function = function Function(argN, body) {
        var result = arguments.length < 3
         ? __Function(argN, body)
         : __Function.apply(__Function, arguments);
        result['__proto__'] = funcPlugin;
        return result;
      };

      Number = function Number(value) {
        var result = new __Number(value);
        result['__proto__'] = numPlugin;
        return result;
      };

      Object = function Object(value) {
        if (value != null) {
          return from(value);
        }
        var result = new __Object;
        result['__proto__'] = objPlugin;
        return result;
      };

      RegExp = function RegExp(pattern, flags) {
        var result = new __RegExp(pattern, flags);
        result['__proto__'] = regPlugin;
        return result;
      };

      String = function String(value) {
        var result = new __String(arguments.length ? value : '');
        result['__proto__'] = strPlugin;
        return result;
      };
    }
    else {
      Array = function Array(length) {
        var argLen = arguments.length;
        if (argLen) {
          return argLen === 1 && length === length >>> 0
            ? new __Array(length)
            : Array.fromArray(arguments);
        }
        return new __Array;
      };

      Boolean = function Boolean(value) {
        return new __Boolean(value);
      };

      Date = function Date(year, month, date, hours, minutes, seconds, ms) {
        if (this.constructor === Date) {
         return arguments.length === 1
           ? new __Date(year)
           : new __Date(year, month, date || 1, hours || 0, minutes || 0, seconds || 0, ms || 0);
        }
        return instance.String(new __Date);
      };

      Function = function Function(argN, body) {
        var fn, result, args = __slice.call(arguments, 0),
         toString = function toString() { return originalBody; },
         originalBody = body = args.pop();

        // ensure we aren't in strict mode and map arguments.callee to the wrapper
        if (body && !reStrict.test(body)) {
          body = 'arguments.callee=arguments.callee.' + uid + ';' + body;
        }

        // create function using global.Function constructor
        fn = new glFunction(args.join(','), body);

        // ensure `thisArg` isn't set to the sandboxed global
        result = fn[uid] = new __Function('global, fn',
          'var sandbox=this;' +
          'return function(){' +
          'return fn.apply(this==sandbox?global:this,arguments)' +
          '}')(global, fn);

        // make toString() return the unmodified function body
        result.toString = toString;

        return result;
      };

      Number = function Number(value) {
        return new __Number(value);
      };

      Object = function Object(value) {
        return value != null ? from(value) : new __Object;
      };

      RegExp = function RegExp(pattern, flags) {
        return new __RegExp(pattern, flags);
      };

      String = function String(value) {
        return new __String(arguments.length ? value : '');
      };

      if (isArrayChainable) {
        Array  = __Array;
      }
      if (isRegExpChainable) {
        RegExp = __RegExp;
      }
    }


    /*----------------------------- ADD STATICS ------------------------------*/

    Number.MAX_VALUE         = 1.7976931348623157e+308;

    Number.MIN_VALUE         = 5e-324;

    Number.NaN               = +'x';

    Number.NEGATIVE_INFINITY = __Number.NEGATIVE_INFINITY;

    Number.POSITIVE_INFINITY = __Number.POSITIVE_INFINITY;

    Array.fromArray = function fromArray(array) {
      var result = new __Array;
      result.push.apply(result, array);
      return result;
    };

    Date.now = function now() {
      return instance.Number(__Date.now());
    };

    // ES5 15.9.4.2
    Date.parse = function parse(dateString) {
      return instance.Number(__Date.parse(dateString));
    };

    // ES5 15.9.4.3
    Date.UTC = function UTC(year, month, date, hours, minutes, seconds, ms) {
      return instance.Number(__Date.UTC(year, month, date || 1, hours || 0, minutes || 0, seconds || 0, ms || 0));
    };

    // ES5 15.5.3.2
    String.fromCharCode = function fromCharCode(charCode) {
      return String(arguments.length > 1
        ? __String.fromCharCode.apply(__String, arguments)
        : __String.fromCharCode(charCode));
    };

    // ES5 15.4.3.2
    if (!isFunction(Array.isArray = __Array.isArray)) {
      Array.isArray = function isArray(value) {
        return toString.call(value) === '[object Array]';
      };
    }

    // ES5 15.9.4.4
    if (!isFunction(__Date.now)) {
      Date.now = function now() {
        return instance.Number(+new __Date());
      };
    }

    if (isProtoMode) {
      Array.fromArray = function fromArray(array) {
        var result = __slice.call(array, 0);
        result['__proto__'] = arrPlugin;
        return result;
      };
    } else if (isArrayChainable) {
      Array.fromArray = function fromArray(array) {
        return __slice.call(array, 0);
      };
    }


    /*--------------------------- ADD CHAINABILITY ---------------------------*/

    if (isFunction(arrPlugin.every)) {
      (arrPlugin.every = function every(callback, thisArg) {
        return __every.call(this, callback || IDENTITY, thisArg);
      }).raw = __every;
    }

    if (isFunction(arrPlugin.filter)) {
      (arrPlugin.filter = function filter(callback, thisArg) {
        var result = __filter.call(this, callback || filterCallback, thisArg);
        return result.length
          ? Array.fromArray(result)
          : Array();
      }).raw = __filter;
    }

    if (isFunction(arrPlugin.indexOf)) {
      (arrPlugin.indexOf = function indexOf(item, fromIndex) {
        return instance.Number(__indexOf.call(this, item,
          fromIndex == null ? 0 : fromIndex));
      }).raw = __indexOf;
    }

    if (isFunction(arrPlugin.lastIndexOf)) {
      (arrPlugin.lastIndexOf = function lastIndexOf(item, fromIndex) {
        return instance.Number(__lastIndexOf.call(this, item,
          fromIndex == null ? this.length : fromIndex));
      }).raw = __lastIndexOf;
    }

    if (isFunction(arrPlugin.map)) {
      if (!IS_MAP_CORRUPT && isArrayChainable) {
        arrPlugin.map = function map(callback, thisArg) {
          return __map.call(this, callback || IDENTITY, thisArg);
        };
      } else {
        if (IS_MAP_CORRUPT) __map = [].map;
        arrPlugin.map = function map(callback, thisArg) {
          var result = __map.call(this, callback || IDENTITY, thisArg);
          return result.length ? Array.fromArray(result) : Array();
        };
      }
      arrPlugin.map.raw = __map;
    }

    if (isFunction(arrPlugin.some)) {
      (arrPlugin.some = function some(callback, thisArg) {
        return __some.call(this, callback || IDENTITY, thisArg);
      }).raw = __some;
    }

    if (isFunction(datePlugin.toISOString)) {
      (datePlugin.toISOString = function toISOString() {
        return instance.String(__toISOString.call(this));
      }).raw = __toISOString;
    }

    if (isFunction(datePlugin.toJSON)) {
      (datePlugin.toJSON = function toJSON() {
        return instance.String(__toJSON.call(this));
      }).raw = __toJSON;
    }

    if (isFunction(strPlugin.trim)) {
      (strPlugin.trim = function trim() {
        return String(__trim.call(this));
      }).raw = __trim;
    }
    if (isFunction(strPlugin.trimLeft)) {
      (strPlugin.trimLeft = function trimLeft() {
        return String(__trimLeft.call(this));
      }).raw = __trimLeft;
    }

    if (isFunction(strPlugin.trimRight)) {
      (strPlugin.trimRight = function trimRight() {
        return String(__trimRight.call(this));
      }).raw = __trimRight;
    }

    if (!isArrayChainable) {
      arrPlugin.concat = function concat() {
        return Array.fromArray(arguments.length
          ? __concat.apply(this, arguments)
          : __concat.call(this));
      };

      arrPlugin.reverse = function reverse() {
        return this.length > 0
          ? Array.fromArray(__reverse.call(this))
          : Array();
      };

      arrPlugin.slice = function slice(start, end) {
        var result = __slice.call(this, start, end == null ? this.length : end);
        return result.length
          ? Array.fromArray(result)
          : Array();
      };

      arrPlugin.splice = function splice(start, deleteCount) {
        var result = __splice.apply(this, arguments);
        return result.length
          ? Array.fromArray(result)
          : Array();
      };
    }

    (arrPlugin.join = function join(separator) {
      return String(__join.call(this, separator));
    }).raw = __join;

    (arrPlugin.push = function push(item) {
      return instance.Number(arguments.length > 1
        ? __push.apply(this, arguments)
        : __push.call(this, item));
    }).raw = __push;

    (arrPlugin.unshift = function unshift(item) {
      return instance.Number(arguments.length > 1
        ? __unshift.apply(this, arguments)
        : __unshift.call(this, item));
    }).raw = __unshift;

    (datePlugin.getDate = function getDate() {
      return instance.Number(__getDate.call(this));
    }).raw = __getDate;

    (datePlugin.getDay = function getDay() {
      return instance.Number(__getDay.call(this));
    }).raw = __getDay;

    (datePlugin.getFullYear = function getFullYear() {
      return instance.Number(__getFullYear.call(this));
    }).raw = __getFullYear;

    (datePlugin.getHours = function getHours() {
      return instance.Number(__getHours.call(this));
    }).raw = __getHours;

    (datePlugin.getMilliseconds = function getMilliseconds() {
      return instance.Number(__getMilliseconds.call(this));
    }).raw = __getMilliseconds;

    (datePlugin.getMinutes = function getMinutes() {
      return instance.Number(__getMinutes.call(this));
    }).raw = __getMinutes;

    (datePlugin.getMonth = function getMonth () {
      return instance.Number(__getMonth.call(this));
    }).raw = __getMonth;

    (datePlugin.getSeconds = function getSeconds() {
      return instance.Number(__getSeconds.call(this));
    }).raw = __getSeconds;

    (datePlugin.getTime = function getTime() {
      return instance.Number(__getTime.call(this));
    }).raw = __getTime;

    (datePlugin.getTimezoneOffset = function getTimezoneOffset() {
      return instance.Number(__getTimezoneOffset.call(this));
    }).raw = __getTimezoneOffset;

    (datePlugin.getUTCDate = function getUTCDate() {
      return instance.Number(__getUTCDate.call(this));
    }).raw = __getUTCDate;

    (datePlugin.getUTCDay = function getUTCDay() {
      return instance.Number(__getUTCDay.call(this));
    }).raw = __getUTCDay;

    (datePlugin.getUTCFullYear = function getUTCFullYear() {
      return instance.Number(__getUTCFullYear.call(this));
    }).raw = __getUTCFullYear;

    (datePlugin.getUTCHours = function getUTCHours() {
      return instance.Number(__getUTCHours.call(this));
    }).raw = __getUTCHours;

    (datePlugin.getUTCMilliseconds = function getUTCMilliseconds() {
      return instance.Number(__getUTCMilliseconds.call(this));
    }).raw = __getUTCMilliseconds;

    (datePlugin.getUTCMinutes = function getUTCMinutes() {
      return instance.Number(__getUTCMinutes.call(this));
    }).raw = __getUTCMinutes;

    (datePlugin.getUTCMonth = function getUTCMonth() {
      return instance.Number(__getUTCMonth.call(this));
    }).raw = __getUTCMonth;

    (datePlugin.getUTCSeconds = function getUTCSeconds() {
      return instance.Number(__getUTCSeconds.call(this));
    }).raw = __getUTCSeconds;

    (datePlugin.getYear = function getYear() {
      return instance.Number(__getYear.call(this));
    }).raw = __getYear;

    (numPlugin.toExponential = function toExponential(fractionDigits) {
      return instance.String(__toExponential.call(this, fractionDigits));
    }).raw = __toExponential;

    (numPlugin.toFixed = function toFixed(fractionDigits) {
      return instance.String(__toFixed.call(this, fractionDigits));
    }).raw = __toFixed;

    (numPlugin.toPrecision = function toPrecision(precision) {
      return instance.String(__toPrecision.call(this, precision));
    }).raw = __toPrecision;

    (regPlugin.exec = function exec(string) {
      var output = __exec.call(this, string);
      if (output) {
        var item, i = -1, length = output.length, result = instance.Array();
        while (++i < length) {
          result[i] = (item = output[i]) == null ? item : instance.String(item);
        }
        result.index = output.index;
        result.input = output.input;
      }
      return output && result;
    }).raw = __exec;

    (strPlugin.charAt = function charAt(pos) {
      return String(__charAt.call(this, pos));
    }).raw = __charAt;

    (strPlugin.charCodeAt = function charCodeAt(pos) {
      return instance.Number(__charCodeAt.call(this, pos));
    }).raw = __charCodeAt;

    (strPlugin.concat = function concat(item) {
      return String(arguments.length > 1
        ? __strConcat.apply(this, arguments)
        : __strConcat.call(this, item));
    }).raw = __strConcat;

    (strPlugin.indexOf = function indexOf(item, fromIndex) {
      return instance.Number(__strIndexOf.call(this, item,
        fromIndex == null ? 0 : fromIndex));
    }).raw = __strIndexOf;

    (strPlugin.lastIndexOf = function lastIndexOf(item, fromIndex) {
      return instance.Number(__strLastIndexOf.call(this, item,
        fromIndex == null ? this.length : fromIndex));
    }).raw = __strLastIndexOf;

    (strPlugin.localeCompare = function localeCompare(that) {
      return instance.Number(__localeCompare.call(this, that));
    }).raw = __localeCompare;

    (strPlugin.match = function match(pattern) {
      var output = __match.call(this, pattern);
      if (output) {
        var item, i = -1, length = output.length, result = instance.Array();
        while (++i < length) {
          result[i] = (item = output[i]) == null ? item : instance.String(item);
        }
      }
      return output && result;
    }).raw = __match;

    (strPlugin.replace = function replace(pattern, replacement) {
      return String(__replace.call(this, pattern, replacement));
    }).raw = __replace;

    (strPlugin.search = function search(pattern) {
      return instance.Number(__search.call(this, pattern));
    }).raw = __search;

    (strPlugin.slice = function slice(start, end) {
      return String(__strSlice.call(this, start,
        end == null ? this.length : end));
    }).raw = __strSlice;

    (strPlugin.split = function split(separator, limit) {
      var item, i = -1, output = __split.call(this, separator, limit),
       length = output.length, result = instance.Array();
      while (++i < length) {
        result[i] = (item = output[i]) == null ? item : String(item);
      }
      return result;
    }).raw = __split;

    (strPlugin.substr = function substr(start, length) {
      return String(__substr.call(start, length == null ? this.length : length));
    }).raw = __substr;

    (strPlugin.substring = function substring(start, end) {
      return String(__substring.call(this, start,
        end == null ? this.length : end));
    }).raw = __substring;

    (strPlugin.toLowerCase = function toLowerCase() {
      return String(__toLowerCase.call(this));
    }).raw = __toLowerCase;

    (strPlugin.toLocaleLowerCase = function toLocaleLowerCase() {
      return String(__toLocaleLowerCase.call(this));
    }).raw = __toLocaleLowerCase;

    (strPlugin.toLocaleUpperCase = function toLocaleUpperCase() {
      return String(__toLocaleUpperCase.call(this));
    }).raw = __toLocaleUpperCase;

    (strPlugin.toUpperCase = function toUpperCase() {
      return String(__toUpperCase.call(this));
    }).raw = __toUpperCase;

    arrPlugin.concat.raw  = __concat;
    arrPlugin.reverse.raw = __reverse;
    arrPlugin.slice.raw   = __slice;
    arrPlugin.splice.raw  = __splice;


    /*-------------------------- MODIFY PROTOTYPES ---------------------------*/

    if (isProtoMode) {
      Object.prototype['__proto__'] = objPlugin;
      arrPlugin['__proto__']  = __Array.prototype;
      boolPlugin['__proto__'] = __Boolean.prototype;
      datePlugin['__proto__'] = __Date.prototype;
      funcPlugin['__proto__'] = __Function.prototype;
      numPlugin['__proto__']  = __Number.prototype;
      regPlugin['__proto__']  = __RegExp.prototype;
      strPlugin['__proto__']  = __String.prototype;
    } else{
      Object.prototype = objPlugin;
    }

    Array.prototype    = arrPlugin;
    Boolean.prototype  = boolPlugin;
    Date.prototype     = datePlugin;
    Function.prototype = funcPlugin;
    Number.prototype   = numPlugin;
    RegExp.prototype   = regPlugin;
    String.prototype   = strPlugin;

    // point constructor properties to the native wrappers
    arrPlugin.constructor  = Array;
    boolPlugin.constructor = Boolean;
    datePlugin.constructor = Date;
    funcPlugin.constructor = Function;
    objPlugin.constructor  = Object;
    numPlugin.constructor  = Number;
    regPlugin.constructor  = RegExp;
    strPlugin.constructor  = String;

    // add [[Class]] property to eaches prototype as a fallback in case
    // toString.call(value) doesn't work on sandboxed natives
    arrPlugin['[[Class]]']  = '[object Array]';
    boolPlugin['[[Class]]'] = '[object Boolean]';
    datePlugin['[[Class]]'] = '[object Date]';
    funcPlugin['[[Class]]'] = '[object Function]';
    numPlugin['[[Class]]']  = '[object Number]';
    regPlugin['[[Class]]']  = '[object RegExp]';
    strPlugin['[[Class]]']  = '[object String]';


    /*------------------------------- CLEANUP --------------------------------*/

    // prevent JScript bug with named function expressions
    var charAt = null, charCodeAt = null, concat = null, every = null, exec = null,
     filter = null, getDate = null, getDay = null, getFullYear = null,
     getHours = null, getMilliseconds = null, getMinutes = null, getMonth = null,
     getSeconds = null, getTime = null, getTimezoneOffset = null, getUTCDate = null,
     getUTCDay = null, getUTCFullYear = null, getUTCHours = null,
     getUTCMilliseconds = null, getUTCMinutes = null, getUTCMonth = null,
     getUTCSeconds = null, getYear = null, join = null, indexOf = null,
     lastIndexOf = null, localeCompare = null, match = null, map = null, push = null,
     replace = null, reverse = null, search = null, slice = null, some = null,
     sort = null, split = null, splice = null, substr = null, substring = null,
     toExponential = null, toFixed = null, toISOString = null, toJSON = null,
     toLowerCase = null, toLocaleLowerCase = null, toLocaleUpperCase = null,
     toPrecision = null, toUpperCase = null, trim = null, trimLeft = null,
     trimRight = null, unshift = null;

    // assign native wrappers to instance object
    (instance.Array    = Array).raw    = __Array;
    (instance.Boolean  = Boolean).raw  = __Boolean;
    (instance.Date     = Date).raw     = __Date;
    (instance.Function = Function).raw = __Function;
    (instance.Number   = Number).raw   = __Number;
    (instance.Object   = Object).raw   = __Object;
    (instance.RegExp   = RegExp).raw   = __RegExp;
    (instance.String   = String).raw   = __String;

    return instance;
  };


  /*--------------------------------------------------------------------------*/

  // The htmlfile ActiveX object is supported by IE4+ and avoids https mixed
  // content warnings in IE6. It is also used as a workaround for access denied errors
  // thrown when using iframes to create sandboxes after the document.domain is
  // set (Opera 9.25 is out of luck here).
  if (HAS_ACTIVEX && !isHostType(global, 'XMLHttpRequest') &&
        global.location && global.location.protocol === 'https:') {
    setMode(ACTIVEX_MODE);
  }
  // Iframes are the fastest and prefered technique
  else if (HAS_IFRAME) {
    setMode(IFRAME_MODE);
  }
  // A fallback for non browser environments and should be supported by
  // JavaScript engines such as Carakan, JaegerMonkey, JavaScriptCore, KJS,
  // Nitro, Rhino, SpiderMonkey, SquirrelFish (Extreme), Tamarin, TraceMonkey,
  // and V8.
  else if (HAS_PROTO) {
    setMode(PROTO_MODE);
  }

  // fix document.readyState for Firefox < 3.6
  if (typeof doc.readyState !== 'string' && isHostType(doc, 'addEventListener')) {
    doc.readyState = 'loading';
    doc.addEventListener('DOMContentLoaded', function() { doc.readyState = 'interactive'; }, true);
    global.addEventListener('load', function() { doc.readyState = 'complete'; }, true);
  }

  // map Fusebox.prototype to Klass so Fusebox can be called without the `new` expression
  Klass.prototype = Fusebox.prototype;

  // expose
  global.Fusebox  = Fusebox;
  Fusebox.getMode = getMode;
  Fusebox.setMode = setMode;
})(this);
