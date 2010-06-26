Introduction
------------
Extending JavaScript natives gives you the power to customize the language to fit your needs.
You can add convenience methods like `"hello world".capitalize()` or implement missing functionality like `[1,2,3].indexOf(2)` in JScript. 
The problem is that frameworks / libraries / third-party scripts may overwrite native methods or each other's custom methods resulting in unpredictable outcomes.
Fusebox, a limited<sup><a name="fnref1" href="#fn1">1</a></sup> version of the sandboxing component found in [FuseJS](http://fusejs.com),
avoids these issues by creating sandboxed natives which can be extended without affecting the document natives.

For example:

      var fb = Fusebox();
      fb.Array.prototype.hai = function() {
        return fb.String("Oh hai, we have " + this.length + " items.");
      };
      
      fb.Array(1, 2, 3).hai(); // "Oh hai, we have 3 items."
      typeof window.Array.prototype.hai; // undefined

Screencasts
-----------
Watch the following screencasts for additional information on the history of
sandboxed natives and a full Fusebox code review.

  1. [Sandboxed Natives 101: Screencast One](http://allyoucanleet.com/2010/01/16/sandboxed-natives-one/)
  2. [How to create a sandbox: Screencast Two](http://allyoucanleet.com/2010/01/16/sandboxed-natives-two/)
  3. [How to create a Fusebox: Screencast Three](http://allyoucanleet.com/2010/01/18/sandboxed-natives-three/)
  4. [The Final Countdown: Screencast Four](http://allyoucanleet.com/2010/01/21/sandboxed-natives-four/)

Supported Fuseboxed natives
---------------------------
      fb.Array;
      fb.Boolean;
      fb.Date;
      fb.Function;
      fb.Number;
      fb.Object;
      fb.RegExp;
      fb.String;

The `new` operator
------------------
      // with `new` operator
      var fb = new Fusebox();
      // or without
      fb = Fusebox();

Attach to a custom object
-------------------
      Fusebox(MyApp);
      var a = MyApp.Array(1, 2, 3);

Chainable
---------
      // returns ["a", "b", "c"] <- array & string values are Fuseboxed
      fb.String("c b a").split(" ").sort();

Working with arrays<sup><a name="fnref2" href="#fn2">2</a></sup>
-------------------
      // like the native Array constructor the Fuseboxed constructor will return [ , , ]
      var a = fb.Array(3);

      // converting a native array to a Fuseboxed array
      var c = fb.Array.fromArray([1, 2, 3]);

Working with object instances
-----------------------------
      var a = fb.String("");
      var b = fb.Number(0);
      
      // not falsy like their primitive counterpart
      if (!a) { /* won't get here */ }
      if (!b) { /* won't get here */ }
      
      // a little utility method will smooth things out
      function falsy(value) {
        !value || value == "";
      }
      if (falsy(a)) { /* will get here */ }
      if (falsy(b)) { /* will get here */ }
      
      // will loosely equate to like values
      fb.String("Oh hai") == "Oh hai"
      fb.String("1") == 1;
      fb.Number(1) == 1;
      
      // will *not* strictly equate to like values
      fb.String("Oh hai") !== "Oh hai";
      fb.Number(1) !== 1;
      
      // will *not* equate (loosely or strictly) to other object instances
      fb.String("Oh hai") != fb.String("Oh hai");
      fb.String("Oh hai") !== fb.String("Oh hai");

Converting Fuseboxed natives to document natives
------------------------------------------------
      var a = fb.String("Oh hai");
      var b = fb.Number(1);
      var c = fb.Array(1, 2, 3);
      
      // results in a document native (primitive)
      "" + a;
      String(a);
      a.valueOf();  
      
      // results in a document native (primitive)
      Number(b);
      b.valueOf();
      +b;
      
      // results in a document native (array object)
      [].slice.call(c, 0);

The `plugin` alias of `prototype`
---------------------------------
      fb.String.plugin.like = function(value) {
        return "" + this == "" + value;
      };
      
      fb.String.plugin.equals = (function() {
        var toString = Object.prototype.toString;
        return function(value) {
          return toString.call(value) === '[object String]' ?
            this.like(value) : false;
        }
      })();
      
      fb.String("1").like(1);   // true
      fb.String("1").equals(1); // false
      fb.String("Oh hai").equals(fb.String("Oh hai")); // true

Gotchas
-------
  - The `__proto__` technique, used by Gecko\WebKit\KHTML, may be affected
    by modifications to the document native constructor's prototype. To
    avoid this issue simply create the Fusebox before modifying the
    document native constructor's prototype.
    
          // problem in Gecko\WebKit\KHTML
          Array.prototype.sort = function() { return "Oh noes!" };
          var fb = Fusebox();
          fb.Array(3, 2, 1).sort(); // ["O", "h", " ", "n", "o", "e", "s", "!"]
          
          // solution
          var fb = Fusebox();
          Array.prototype.sort = function() { return "Oh noes!" };
          fb.Array(3, 2, 1).sort(); // [1, 2, 3]

  - Fuseboxed natives created by the ActiveX / iframe techniques will
    inherit<sup><a name="fnref3" href="#fn3">3</a></sup>
    from the Fuseboxed Object object's prototype.
    
          fb.Object.prototype.nom = function() {
            return fb.String(this + " nom nom nom!");
          };
          
          fb.String("Cheezburger").nom(); // "Cheezburger nom nom nom!"

  - Fuseboxed native instances created by the `__proto__` technique will 
    return `true` for `instanceof` operations against document native constructors.
    The `instanceof` operator should be avoided for object type
    detection<sup><a name="fnref4" href="#fn4">4</a></sup>.
    
          // returns true Fuseboxed native constructors...
          fb.Number(1) instanceof fb.Number; // true
          fb.Array(1, 2, 3) instanceof fb.Array; // true
          fb.String("Oh hai") instanceof fb.String; // true
          
          // but also document native constructors in Gecko\WebKit\KHTML
          fb.Number(1) instanceof Number; // true
          fb.Array(1, 2, 3) instanceof Array; // true
          fb.String("Oh hai") instanceof String; // true

Footnotes
---------
  1. FuseJS supports native generics like`fb.Array.slice(array, 0)` and
     fixes cross-browser `\s` RegExp character class inconsistencies.
     <a name="fn1" title="Jump back to footnote 1 in the text." href="#fnref1">&#8617;</a>

  2. FuseJS supports additional Array helpers like `fuse.Array.from()` and `fuse.Array.fromNodeList()`.
     <a name="fn2" title="Jump back to footnote 2 in the text." href="#fnref2">&#8617;</a>

  3. The Object object inheritance inconsistency is resolved in FuseJS by assigning `fuse.Object` an object Object
     of a different Fusebox instance effectively removing Object object inheritance for the other natives on the `fuse` namespace.
     <a name="fn3" title="Jump back to footnote 3 in the text." href="#fnref3">&#8617;</a>

  4. For more information on why `instanceof` should be avoided please read
     "[instanceof considered harmful](http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/)"
     by Juriy Zaytsev and 
     "[Working around the instanceof memory leak](http://ajaxian.com/archives/working-aroung-the-instanceof-memory-leak)"
     by Gino Cochuyt.
     <a name="fn4" title="Jump back to footnote 4 in the text." href="#fnref4">&#8617;</a>
