var tools = require('./tools'),
    sys = require('util'),
    File = require('./file').File,
    //sharedHandlers = require('./handlers').sharedHandlers,
    HandlerSet = require('./handlers/handler_set').HandlerSet,
    Framework = require('./framework').Framework,
    FrameworkBundler = require('./framework_bundler').FrameworkBundler,
    Bundle = require('./bundle').Bundle,
    Sproutcore = require('./sproutcore').Sproutcore;

exports.App = Framework.extend({
  // name of the app, used for url/app or app save
  
  //configurable properties 
  
  name: null,
  //buildLanguage: 'english', // standard language
  buildLanguage: null, // only use if defined, autodetect otherwise
  
  htmlHead: null, // to override the standard html header of the application
  htmlBody:  ['<div id="loading">',
	    '<p id="loading">',
		    'Loading…',
		  '</p>',
	  '</div>'].join("\n"), // to be added to the html body
  htmlScripts: null, // add scripts to be added to the generated html
  
  
  combineStylesheets: false, // put stylesheets as one file when serving
  combineScripts: false, // combine scripts as one file when serving
  minifyScripts: false, // minify scripts when serving
  minifyStylesheets: false, // minify style sheets when serving
  
  stylesheetProcessor: 'sass', // what stylesheet processor to use
  
  combineOnSave: true, // 
  minifyOnSave: false,
    
  urlPrefix: null, // application url prefix
  theme: '', // application theme
  buildPath: 'build', // the actual savepath will be buildPath/buildVersion/
  hasSC: true, // should the app include Sproutcore?
  configSC: { // what parameters do we want SC to have?
    version: '1.4.5'  
  },

  //internal affairs
  
  server: null,
  frameworks: null, // the set of frameworks this app depends on
  
  //buildVersion: new Date().getTime(), //buildVersion
  buildVersion: null, // will be set by the saving procedure...
  
  isBuilding: false,
  doneBuilding: false,
  
  init: function(){
    arguments.callee.base.apply(this,arguments);
    if(this.urlPrefix === null) this.urlPrefix = "";
    if(!this._frameworks) this._frameworks = [];
    this.belongsTo = this;
    //if(!this.server) this.server = { files: {} };
  },
  
  addFramework: function(fw){
    var optsstring, optslist, k;
    if(!fw) return;
    optslist = ["combineStylesheets","combineScripts","minifyScripts","minifyStylesheets","server","buildPath",
      "stylesheetProcessor", "buildVersion","isBundle","bundleDeps","shouldPreload","combineOnSave","minifyOnSave",
      "nodifyScripts","theme","pathsToExclude","urlPrefix"];
    optslist.forEach(function(opt){
      if(fw[opt] === undefined) fw[opt] = this[opt]; // only copy if not defined
    },this);
    fw.belongsTo = this;
    
    if(!this.server) this.server = { files: [] }; // fake a server in case we are only saving...
    
    k = fw.hasNestedFrameworks? FrameworkBundler: fw.isBundle? Bundle: Framework; 
    
    this._frameworks.push(k.create(fw));  
  },
  
  addFrameworks: function(){
    var args = Array.prototype.slice.call(arguments);

    if (args[0] instanceof Array) {
      args = args[0];
    }

    args.forEach(function(framework) {
      this.addFramework(framework);
    }, this);
  },
  
  addSproutcore: function(){
    var opts = this.configSC || {};
    opts.server = this.server;
    opts.stylesheetProcessor = 'sass';
    opts.theme = this.theme;
    opts.belongsTo = this;
    this._frameworks.push(Sproutcore.create(opts));
    //this.addFramework(Sproutcore.create());
  },
  
  _rootHTMLHead: function(){
    var blang = this.get('buildLanguage');
    var lang = blang? blang.toShortLanguage(): '';
    var html = [];
    //if(!lang) tools.util.puts('WARNING: short language code for ' + blang + ' is undefined.');
    lang = lang? ' lang="' + lang + '"': '';
    
    html.push(
      '<!DOCTYPE html>',
      '<html' + lang + '>',
      '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">',
        this.chromeFrameSupport ? '<meta http-equiv="X-UA-Compatible" content="IE=9,chrome=1">' : ''
    );
    if (this.htmlHead !== null) html.push(this.htmlHead);
    if (this.htmlStylesheets !== null) html.push(this.htmlStylesheets);
    return html;
  }.property(),
  
  targets: function(){
    var ret = this._frameworks.getEach('targets');
    ret.push({
      kind: 'app',
      name: "/" + this.name,
      link_docs: '',
      link_root: this.get('url'),
      link_tests: this.get('url') + "/tests/-index.json"
    });
    return ret.flatten();
  }.property().cacheable(),
  
  rootContent: function(htmlStylesheets, htmlScripts){
    var me = this,
        buildLanguage = this.get('buildLanguage');
    
    return function(callback){
      var html = me.get('_rootHTMLHead'),
          fws,file;
          
      var addStylesheetLink = function(stylesheet){
        if(!stylesheet) return;
        html.push('<link href="' + me.get('urlPrefix') + stylesheet.get('url') + '" rel="stylesheet" type="text/css" media="screen">');
      };
      var parseOrderedStylesheets = function(stylesheets){
        if(!stylesheets) return;
        stylesheets.forEach(addStylesheetLink);
      };
      
      var addScriptLink = function(script){
        if(!script){
          tools.util.log('trying to parse an non existing script?...');
          return;
        }
        html.push('<script type="text/javascript" src="' + me.get('urlPrefix') + script.get('url') + '"></script>');
      };
      var parseOrderedScripts = function(scripts){
        if(!scripts){
          tools.util.log('trying to parse an non existing scripts array?...');
          return;
        }
        scripts.forEach(addScriptLink);
      };
      
      
      fws = me._frameworks.filter(function(fw){
        //sys.log('filtering frameworks in rootcontent: ');
        //sys.log('fw name is %@ and fw.isBundle: %@, fw.shouldPreload: %@'.fmt(fw.get('name'), fw.get('isBundle'), fw.get('shouldPreload')) );
        if(fw.isBundle && !fw.shouldPreload){
          //sys.log('filtering out ' + fw.get('name'));
          return false;
        } 
        else return true;
      });
      
      //me_frameworks is an array, orderedStylesheets too
      if (!htmlStylesheets) {
        fws.getEach('orderedStylesheets').forEach(parseOrderedStylesheets);
      } 
      else html.push(htmlStylesheets);
      
      html.push('</head>');
      
      html.push('<body class="' + me.get('theme') + ' focus sc-theme box-shadow border-rad">');
      if(me.get('htmlBody') !== null) html.push(me.get('htmlBody'));
      
      if(!htmlScripts){
        //tools.util.log('orderedScripts: ' + tools.util.inspect(me._frameworks.getEach('orderedScripts')));
        fws.getEach('orderedScripts').forEach(parseOrderedScripts);
      } 
      else html.push(htmlScripts);
      
      if(me.htmlScripts !== null) html.push(me.htmlScripts);
    
      if(!me.buildLanguage){
        html.push('<script type="text/javascript">');
        html.push('  String.autodetectLanguage = true;');
        html.push('  SC.Locale.useAutodetectedLanguage = true;'); // have to do too much hacking to make this work correctly
        html.push('  if (SC.setupBodyClassNames) SC.setupBodyClassNames() ;');        
        html.push('</script>'); // for compatability
      }
      else {
        //html.push('<script type="text/javascript">String.preferredLanguage = "' + me.buildLanguage + '";</script>');
        html.push('<script type="text/javascript">');
        html.push('  String.preferredLanguage = "' + me.buildLanguage + '";');
        html.push('  SC.Locale.preferredLanguage = "' + me.buildLanguage + '";');
        html.push('  if (SC.setupBodyClassNames) SC.setupBodyClassNames() ;');
        html.push('</script>'); // for compatability        
      }  
    
      html.push(addScriptLink(me._bundleInfo));

      html.push('</body>','</html>');
      
      callback(null,html.join('\n'));
    };
  },
  
  buildRoot: function(){
    var file, symlink;

    file = File.create({ 
      path: this.name, 
      belongsTo: this,
      handler: HandlerSet.create({ handlerList: "contentType file".w()}), 
      content: this.rootContent(), 
      isHtml: true, 
      framework: this });
    //this.server.registerURL(file.get('url'), file);
    this.server.files[file.get('url')] = file;
    
    var bundleinfo = this._createBundleFile(this._frameworks.filterProperty('isBundle',true));
    this._bundleInfo = bundleinfo;
    //this.server.registerURL(bundleinfo.get('url'),bundleinfo);
    this.server.files[bundleinfo.get('url')] = bundleinfo;

    symlink = File.create({ 
      handler: HandlerSet.create({ handlerList: 'symlink'.w()}), 
      isSymlink: true, 
      symlink: file 
    });
    //this.server.registerURL(this.name, symlink);
    this.server.files[this.name] = symlink;
  },
  
  build: function(callback){
    var count = 0,
        me = this;
    var isReadyCb = function(fw){
      return function(){
        count +=1;
        //tools.log('framework ' + fw.get('name') + ' ready... ' + (me._frameworks.length - count) + " fws to go...");
        if(count === me._frameworks.length){
          me.buildRoot();
          me.doneBuilding = true; //flag that we have a build
          me.isBuilding = false; // flag that we are no longer building
          callback();
        }        
      };
    };
    
    if(!this.server) tools.log("whoops, trying to build an app without a server obj?");
    //tools.log('this is: ' + tools.inspect(this));
    if(this.isBuilding){
      tools.log("we don't start another build, as this app is already building");
      return; // don't start another build when already building...
    } 
    this.isBuilding = true; // flag that we are building...
    
    if(this.hasSC) this.addSproutcore();
    if(this.frameworks){
      this.addFrameworks(this.frameworks);
    }
    
    this.files = {};
    var fwparser = function(fw){
      //tools.log('parsing framework: ' + fw.get('name'));
      fw.build(isReadyCb(fw));
    };
    this._frameworks.forEach(fwparser,this);
  },
  
  _createBundleFile: function(bundles){
    var path,file,bundleInfo = [];
    //var content = 'var SC = SC || { BUNDLE_INFO: { ';
    var prefetched = [];
    //var content = 'SC.mixin(SC,{ MODULE_INFO: { ';
    //sys.log('_createBundleFile is called...');
  
    var numbundles = this._frameworks.filterProperty('isBundle',true).length;
    
    var content = function(callback){
      //var numbundles = 0;
      var counter = 0;
      var bundleInfo = {};

      var bundlereport = function(name, bundledata){
        var c;
        //tools.log('bundlereporter called for ' + name);
        counter += 1;
        bundleInfo[name] = bundledata;
        //tools.log('bundledata is ' + tools.inspect(bundledata));
        if(numbundles === counter){
          c = "SC.mixin(SC, { MODULE_INFO: ";
          c += JSON.stringify(bundleInfo) + ",";
          c += "LAZY_INSTANTIATION: {} });";
          //tools.log('about to call callback with content: ' + c);
          callback(null,c);
        }
      };

      //tools.log('bundles is: ' + tools.inspect(bundles));
      if(!bundles || bundles.length === 0 || numbundles === 0){
        callback(null,"SC.mixin(SC, { MODULE_INFO: {}, LAZY_INSTANTIATION: {} });");
      }
      else {
        for(path in bundles){
          if(bundles.hasOwnProperty(path)){
            //numbundles += 1;
            bundles[path].bundleInfo.call(bundles[path],bundlereport);
          }
        }              
      }
    };
    // 
    // 
    // 
    // for(path in bundles){
    //   if(bundles.hasOwnProperty(path)){
    //     bundleInfo.push(bundles[path].get('bundleInfo'));
    //     if(bundles[path].shouldPrefetch) prefetched.push(bundles[path]);
    //   }
    // }
    // content += bundleInfo.join(", ") + "}, LAZY_INSTANTIATION: {} });";
    // sys.log('bundleinfo is: ' + content);
    // 
    // var c = function(callback){
    //   var len, count = 0;
    //   var bundledata = {};
    //   var report = function(){
    //     count += 1;
    //     if(count === len) callcb();
    //   };
    //   
    //   var callcb = function(){
    //     // call callback with contents
    //     tools.log('bundledata = ' + tools.inspect(bundledata));
    //     callback(null,content);
    //   };
    //   len = prefetched.length;
    //   if(len === 0) callcb();
    //   else {
    //     prefetched.forEach(function(bundle){
    //       var s = bundle.orderedScripts[0];
    //       s.handler.handle(s,null,function(response){
    //         //tools.log('return arguments from handler: ' + tools.inspect(arguments));
    //         bundledata[bundle.get('name')] = response.data;
    //         report();
    //       });
    //     });
    //   }
    // };
    
    file = File.create({ 
      path: this.get('name') + '_bundleInfo.js',
      framework: this, 
      belongsTo: this,
      //content: function(callback){ callback(null, content);}, 
      content: content,
      handler: HandlerSet.create({ handlerList: ['contentType','file']}),
      isScript: true,
      isVirtual: true 
    });
      
    return file;
    
    /*
    App.prototype._createBundleInfo = function(bundles){ // create file with bundle info 
      var path, file, bundleInfo = [], curBundle, tmp,  i,
      content = 'var SC = SC || { BUNDLE_INFO: { ';

      for(path in bundles){
        curBundle = bundles[path];
        tmp = path + ': { loaded: false';
        if(curBundle.bundleDeps){
          tmp += ', requires: [';
          tmp += this.wrapper(curBundle.bundleDeps,"'").join(',') + '] ';
        }
        // Note: garcon doesn't yet support non combined builds, as soon as these are implemented, the following has to be adapted too!

        // add styles property to BUNDLEINFO, array with urls, in this case one with the combined sheets
        if(curBundle.stylesheets.length > 1){
          tmp += ", styles: ['" + path + ".css']";  
        }
        // add scripts property to BUNDLEINFO, array with urls, in this case one with the combined scripts
        if(curBundle.scripts.length > 0){
          tmp += ", scripts: ['" + path + ".js']";  
        }
        tmp += '}';
        bundleInfo.push(tmp);
      }
      content += bundleInfo.join(", ") + "} , LAZY_INSTANTIATION: {} };";
      file = new File({ 
        path: this.name + '_bundleInfo.js', 
        framework: this, 
        content: function(callback){ callback(null, content);}, 
        handler: sharedHandlers.build(['file']),
        isVirtual: true });
      return file;

    };
    */
  },
  
  _performSave: function(){
    var me = this,
        html = this.server.files[this.name].symlink, 
        bundles = {},
        scname = this.get('name') + "_sc",
        _sc_,
        
        mainBundle = Bundle.create({ 
          name: this.get('name'), 
          belongsTo: this,
          combineScripts: this.get('combineScripts'),
          combineStylesheets: this.get('combineStylesheets'),
          combineOnSave: this.get('combineOnSave'),
          minifyOnSave: this.get('minifyOnSave'),
          //buildPath: tools.path.join(this.buildPath,this.get('name')),
          buildPath: this.buildPath,
          //server: this.server, // pretend that we have one...
          framework: this,
          buildVersion: this.buildVersion
          //framework: this 
        });
    
    tools.log('performing save...');
    this.isSaving = true;
    tools.log('builddir: ' + this.get('savePath'));
    this._frameworks.forEach(function(fw){
      //fw.urlFor = function(path){ return this.nameFor(path); };
      var fwname = fw.get('name');
      if(fw.isSC){ 
        // sc should not be mixed in with the main bundle, but should be separate, and not in the bundle info
        // so just save the fw
        fw.name = scname;
        fw.buildPath = this.buildPath;
        fw.buildVersion = this.buildVersion;
        fw.combineOnSave = this.combineOnSave;
        if(fw.nodifyScripts){
          var errmsg = "WARNING: You are saving an application while nodifying Sproutcore. ";
          errmsg += "jQuery is not included in a nodified Sproutcore build, so your app might not work!";
          tools.log(errmsg);
        }
        fw.save();
        _sc_ = fw;
        return;
      }
      if(fw.isBundle && !fw.shouldPreload){
        // bundle and not preload? save separately
        tools.log('saving Bundle: ' + fw.get('name'));
        bundles[fw.get('name')] = fw;
        fw.save();
      }
      // "normal" fw, add to main bundle
      else {
        mainBundle.add(fw.get('orderedScripts'), fw.get('orderedStylesheets'), fw.get('resources')); 
      }
    },this);

    // before saving the main bundle, we have to add the bundle info up front
    var oScripts = mainBundle.get('orderedScripts');
    oScripts.unshift(this._createBundleFile(bundles));
    mainBundle.orderedScripts = oScripts; // replace computed property by 
    if(!html) throw new Error("No app HTML file found, this means trouble!");
    html.content = this.rootContent(
      ['<link href="' + this.urlPrefix + _sc_.name + '.css" rel="stylesheet" type="text/css">',
       '<link href="' + this.urlPrefix + mainBundle.name + '.css" rel="stylesheet" type="text/css">'].join("\n"),
      ['<script type="text/javascript" src="' + this.get('urlPrefix') + _sc_.name + '.js"></script>',
      '<script type="text/javascript" src="' + this.get('urlPrefix') + mainBundle.name + '.js"></script>'].join("\n")
    );
    tools.log('performing save of mainBundle');
    mainBundle.resources.unshift(html); // add to mainbundle
    mainBundle.save();
      
    
    
    /*
    html = this.server.files[this.name].symlink;

    // now parse bundles and save 'em
    this._saveBundles(bundles);

    // mainBundle save:
    stylesheet = new File({ path: that.name + '.css', framework: that,  handler: sharedHandlers.build(['join']), children: mainBundle.stylesheets });
    this._makeSaver(that,stylesheet)();

    mainBundle.scripts.unshift(this._createBundleInfo(bundles)); // add the bundle info up front

    script = new File({ path: that.name + '.js', framework: that, handler: sharedHandlers.build(['join']), children: mainBundle.scripts  });
    this._makeSaver(that,script)();

    // save resources
    if(mainBundle.resources) mainBundle.resources.forEach(function(resource){ that._makeSaver(that,resource)(); });

    if(!html) throw new Error("No app HTML file found, this means trouble!");
    html.content = this.rootContent(
      '<link href="' + that.urlPrefix + stylesheet.url() + '" rel="stylesheet" type="text/css">',
      '<script type="text/javascript" src="' + that.urlPrefix + script.url() + '"></script>'
    );
    this._makeSaver(that,html)();
    */
    
  },
  
  save: function(){
    var me = this;
    //this.buildVersion = new Date().getTime().toString(); // needs to be a string for path.join to be accepted
    if(!this.doneBuilding){
      if(!this.isBuilding) {
        if(!this.server){
          this.server = { 
            files: [],
            registerURL: function(url,fileobj){
              if(!this.files) this.files = {};
              this.files[url] = fileobj;
            }
          };
        } 
        var f = function(){
          me._performSave.call(me);
        };
        this.build(f);
      }
    }
    else this._performSave();
  }
  
  
  /*
  App.prototype.save = function(){
    var that = this,
        html,
        frameworks = that.frameworks,
        server = that.server,
        bundles = {}, mainBundle,
        stylesheet, script,
        bundleInfo,
        url, file, targetBundle, fw_i, cur_fw, bundlesForInfo;

    var makeBundle = function(name, bundleDeps, shouldPreload){ 
      return { 
        name: name, bundleDeps: bundleDeps, shouldPreload: shouldPreload, 
        stylesheets: [], scripts: [], resources: [] 
      }; 
    };

    var addToBundle = function(bundle,scripts,stylesheets,resources){
      if(scripts) bundle.scripts = bundle.scripts.concat(scripts);
      if(stylesheets) bundle.stylesheets = bundle.stylesheets.concat(stylesheets);
      if(resources) bundle.resources = bundle.resources.concat(resources);
      return bundle;
    };

    mainBundle = makeBundle();
    //that.urlPrefix = '../'; originally the buildversion would be in front of the path... 
    // but that is not working in node 0.4, so commenting out this urlPrefix
    //sharedHandlers.urlPrefix = that.urlPrefix; 
    sharedHandlers.urlPrefix = this.isSaving? "":  "/";
    //gather files in bundles, separate the bundles which should not preload  
    for(fw_i=0;fw_i<frameworks.length;fw_i+=1){
      cur_fw = frameworks[fw_i];
      if(!bundles[cur_fw.name()] && cur_fw.isBundle){
        bundles[cur_fw.name()] = makeBundle(cur_fw.name(),cur_fw.bundleDeps,cur_fw.shouldPreload);
      } 
      if(cur_fw.isBundle){
        bundles[cur_fw.name()] = addToBundle(bundles[cur_fw.name()], cur_fw.orderedScripts, cur_fw.orderedStylesheets, cur_fw.resources);
        if(cur_fw.shouldPreload) { // if preload, mix in with mainBundle
          mainBundle = addToBundle(mainBundle,cur_fw.orderedScripts, cur_fw.orderedStylesheets, cur_fw.resources);
        }
      }
      else { // normal framework
        mainBundle = addToBundle(mainBundle,cur_fw.orderedScripts, cur_fw.orderedStylesheets, cur_fw.resources);
      }
    }

    html = this.server.files[this.name].symlink;

    // now parse bundles and save 'em
    this._saveBundles(bundles);

    // mainBundle save:
    stylesheet = new File({ path: that.name + '.css', framework: that,  handler: sharedHandlers.build(['join']), children: mainBundle.stylesheets });
    this._makeSaver(that,stylesheet)();

    mainBundle.scripts.unshift(this._createBundleInfo(bundles)); // add the bundle info up front

    script = new File({ path: that.name + '.js', framework: that, handler: sharedHandlers.build(['join']), children: mainBundle.scripts  });
    this._makeSaver(that,script)();

    // save resources
    if(mainBundle.resources) mainBundle.resources.forEach(function(resource){ that._makeSaver(that,resource)(); });

    if(!html) throw new Error("No app HTML file found, this means trouble!");
    html.content = this.rootContent(
      '<link href="' + that.urlPrefix + stylesheet.url() + '" rel="stylesheet" type="text/css">',
      '<script type="text/javascript" src="' + that.urlPrefix + script.url() + '"></script>'
    );
    this._makeSaver(that,html)();

  };

  App.prototype.wrapper = function(ary,wrapper){
    var i,len,ret = [];

    for(i=0,len=ary.length;i<len;i+=1){
      ret.push(wrapper + ary[i] + wrapper);
    }
    return ret;
  };

  App.prototype._createBundleInfo = function(bundles){ // create file with bundle info 
    var path, file, bundleInfo = [], curBundle, tmp,  i,
    content = 'var SC = SC || { BUNDLE_INFO: { ';

    for(path in bundles){
      curBundle = bundles[path];
      tmp = path + ': { loaded: false';
      if(curBundle.bundleDeps){
        tmp += ', requires: [';
        tmp += this.wrapper(curBundle.bundleDeps,"'").join(',') + '] ';
      }
      // Note: garcon doesn't yet support non combined builds, as soon as these are implemented, the following has to be adapted too!

      // add styles property to BUNDLEINFO, array with urls, in this case one with the combined sheets
      if(curBundle.stylesheets.length > 1){
        tmp += ", styles: ['" + path + ".css']";  
      }
      // add scripts property to BUNDLEINFO, array with urls, in this case one with the combined scripts
      if(curBundle.scripts.length > 0){
        tmp += ", scripts: ['" + path + ".js']";  
      }
      tmp += '}';
      bundleInfo.push(tmp);
    }
    content += bundleInfo.join(", ") + "} , LAZY_INSTANTIATION: {} };";
    file = new File({ 
      path: this.name + '_bundleInfo.js', 
      framework: this, 
      content: function(callback){ callback(null, content);}, 
      handler: sharedHandlers.build(['file']),
      isVirtual: true });
    return file;

  };

  App.prototype._saveBundles = function(bundles){
    var path, bundle,
        me = this,
        styleSheet, script, resources;

    var makeFile = function(path,children){
      return new File({
        path: path,
        framework: me,
        handler: sharedHandlers.build(['join']),
        children: children
      });
    };

    for(path in bundles){
      if(!bundles[path].shouldPreload){ // don't save bundles that are preloaded
        styleSheet = makeFile((path + '.css'),bundles[path].stylesheets);
        script = makeFile((path + '.js'),bundles[path].scripts);
        this._makeSaver(me,styleSheet)();
        this._makeSaver(me,script)();
        resources = bundles[path].resources;
        l.sys.puts('resources in bundle ' + path + ": " + l.sys.inspect(bundles[path].resources));
        if(resources && (resources.length > 0)) resources.forEach(function(resource){ me._makeSaver(me,resource)(); });
      }
    }
  };

  App.prototype._makeSaver = function(app, file) {
    return function() {
      file.handler.handle(file, null, function(r) {
        var path;

        if (r.data.length > 0) {
          path = l.path.join(app.savePath, file.savePath());

          File.createDirectory(l.path.dirname(path));
          l.fs.writeFile(path, r.data, function(err) {
            if (err) throw err;
          });
        }
      });
    };
  */
  
  
});
/*


var self = this,
    l = {},
    App, File, Framework, sharedHandlers;

File = require('./file').File;
Framework = require('./framework').Framework;
sharedHandlers = require('./handlers').sharedHandlers;
l.fs = require('fs');
l.path = require('path');
l.util = require('util');

self.App = function(options) {
  var key;
    
  this.name = null;
  this.server = null;
  this.buildVersion = new Date().getTime();
  this.buildLanguage = 'english';
  this.combineStylesheets = false;
  this.combineScripts = false;
  this.minifyScripts = false;
  this.minifyStylesheets = false;
  this.htmlHead = null;
  this.htmlStylesheets = null;
  this.htmlBody = null;
  this.htmlScripts = null;
  this.urlPrefix = '';
  this.theme = 'sc-theme';
  this.savePath = 'build';
  this.isSaving = false;
  
  for (key in options) {
    this[key] = options[key];
  }
};

App = self.App;

App.prototype.nameFor = Framework.prototype.nameFor;
App.prototype.urlFor = Framework.prototype.urlFor;

App.prototype.addFramework = function(framework) {
  if (this.frameworks === undefined) {
    this.frameworks = [];
  }
  
  if (!(framework instanceof Framework)) {
    framework = new Framework(framework);
  }
  
  framework.server = this.server;
  
  if (framework.buildVersion === null) {
    framework.buildVersion = this.buildVersion;
  }
  
  ['combineScripts', 'combineStylesheets', 'minifyScripts', 'minifyStylesheets'].forEach(function(key) {
    if (this[key] === true) {
      framework[key] = true;
    }
  }, this);
  
  this.frameworks.push(framework);
  
  return framework;
};

App.prototype.addFrameworks = function() {
  var args = Array.prototype.slice.call(arguments);
  
  if (args[0] instanceof Array) {
    args = args[0];
  }
  
  args.forEach(function(framework) {
    this.addFramework(framework);
  }, this);  
};

App.prototype.addSproutcore = function(options) {
  if (options === undefined) options = {};
  options.server = this.server;
  this.addFrameworks(Framework.sproutcoreFrameworks(options));
};

App.prototype.rootContent = function(htmlStylesheets, htmlScripts) {
  var that = this;
  
  return function(callback) {
    var html = [],
        file, lang;

    lang = that.buildLanguage.toShortLanguage();
    if (!lang) {
      l.sys.puts('WARNING: short language code for "' + that.buildLanguage + '" is undefined.');
      lang = '';
    } else {
      lang = ' lang="' + lang + '"';
    }    

    html.push(
      '<!DOCTYPE html>',
      '<html' + lang + '>',
      '<head>',
        '<meta charset="utf-8">',
        '<meta http-equiv="X-UA-Compatible" content="IE=9,chrome=1">'
    );

    if (that.htmlHead !== null) html.push(that.htmlHead);
    if (that.htmlStylesheets !== null) html.push(that.htmlStylesheets);

    if (htmlStylesheets === undefined) {
      that.frameworks.forEach(function(framework) {
        framework.orderedStylesheets.forEach(function(stylesheet) {
          if (stylesheet.framework === framework) {
            html.push('<link href="' + that.urlPrefix + stylesheet.url() + '" rel="stylesheet" type="text/css">');
          }
        });
      });
    } else {
      html.push(htmlStylesheets);
    }

    html.push(
      '</head>',
      '<body class="' + that.theme + ' focus">'
    );

    if (that.htmlBody !== null) html.push(that.htmlBody);
    
    html.push('<script type="text/javascript">String.preferredLanguage = "' + that.buildLanguage + '";</script>');
    
    if (that.htmlScripts !== null) html.push(that.htmlScripts);
    
    if (htmlScripts === undefined) {
      that.frameworks.forEach(function(framework) {
        framework.orderedScripts.forEach(function(script) {
          html.push('<script type="text/javascript" src="' + that.urlPrefix + script.url() + '"></script>');
        });
      });
    } else {
      html.push(htmlScripts);
    }

    html.push(
    	  '</body>',
      '</html>'
    );

    html = html.join('\n');

    callback(null, html);
  };
};

App.prototype.buildRoot = function() {
  var handler, file, symlink;
  
  handler = sharedHandlers.build(['cache', 'contentType', 'file']);
  file = new File({ path: this.name, handler: handler, content: this.rootContent(), isHtml: true, framework: this });
  this.server.files[file.url()] = file;
  
  handler = sharedHandlers.build(['symlink']);
  symlink = new File({ handler: handler, isSymlink: true, symlink: file });
  this.server.files[this.name] = symlink;
};

App.prototype.build = function(callback) {
  var Builder = function(app, callback) {
    var that = this;
    
    that.count = app.frameworks.length - 1;
    that.hasCalledCallback = false;
    
    that.callbackIfDone = function() {
      if (callback && that.count <= 0 && !that.hasCalledCallback){ 
        // hack to prevent having the callback called twice... Unclear why in certain circumstances that.count can be also -1
        that.hasCalledCallback = true;
        callback();
      } 
    };
    
    that.build = function() {
      app.files = {};

      app.buildRoot();
      l.sys.log('numFrameworks ' + app.frameworks.length);
      app.frameworks.forEach(function(framework,index,ary) {
        framework.build(function() {
          that.count -= 1;
          that.callbackIfDone();
        });
      });
    };
  };
  
  return new Builder(this, callback).build();
};
*/
/*
App.prototype.save = function() {
  var that = this,
      stylesheets = [],
      scripts = [],
      stylesheet, script, html, savr;
  
  var Saver = function(app, file) {
    var that = this;
    
    that.save = function() {
      file.handler.handle(file, null, function(r) {
        var path;
        
        if (r.data.length > 0) {
          path = l.path.join(app.savePath, file.savePath());

          File.createDirectory(l.path.dirname(path));
          l.fs.writeFile(path, r.data, function(err) {
            if (err) throw err;
          });
        }
      });
    };
  };
  
  that.urlPrefix = '../';
  sharedHandlers.urlPrefix = that.urlPrefix;
  
  that.frameworks.forEach(function(framework) {
    var file, url;
    
    for (url in that.server.files) {
      file = that.server.files[url];
      if (file.framework === framework) {
        if (file.isStylesheet()) stylesheets.push(file);
        if (file.isScript()) scripts.push(file);
        if (file.isResource()) new Saver(that, file).save();
      }
      if (file.isSymlink) html = file.symlink;
      //if (file.isHtml) html = file;
    }
  });
  
  stylesheet = new File({
    path: that.name + '.css',
    framework: that,
    handler: sharedHandlers.build(['join']),
    children: stylesheets
  });
  
  savr = new Saver(that, stylesheet);
  savr.save();
  
  script = new File({
    path: that.name + '.js',
    framework: that,
    handler: sharedHandlers.build(['join']),
    children: scripts
  });
  
  savr = new Saver(that, script);
  savr.save();
  
  html.content = this.rootContent(
    '<link href="' + that.urlPrefix + stylesheet.url() + '" rel="stylesheet" type="text/css">',
    '<script type="text/javascript" src="' + that.urlPrefix + script.url() + '"></script>'
  );
  
  savr = new Saver(that, html);
  savr.save();
};
*/

/*
App.prototype.save = function(){
  var that = this,
      html,
      frameworks = that.frameworks,
      server = that.server,
      bundles = {}, mainBundle,
      stylesheet, script,
      bundleInfo,
      url, file, targetBundle, fw_i, cur_fw, bundlesForInfo;
  
  var makeBundle = function(name, bundleDeps, shouldPreload){ 
    return { 
      name: name, bundleDeps: bundleDeps, shouldPreload: shouldPreload, 
      stylesheets: [], scripts: [], resources: [] 
    }; 
  };

  var addToBundle = function(bundle,scripts,stylesheets,resources){
    if(scripts) bundle.scripts = bundle.scripts.concat(scripts);
    if(stylesheets) bundle.stylesheets = bundle.stylesheets.concat(stylesheets);
    if(resources) bundle.resources = bundle.resources.concat(resources);
    return bundle;
  };
  
  mainBundle = makeBundle();
  //that.urlPrefix = '../'; originally the buildversion would be in front of the path... 
  // but that is not working in node 0.4, so commenting out this urlPrefix
  //sharedHandlers.urlPrefix = that.urlPrefix; 
  sharedHandlers.urlPrefix = this.isSaving? "":  "/";
  //gather files in bundles, separate the bundles which should not preload  
  for(fw_i=0;fw_i<frameworks.length;fw_i+=1){
    cur_fw = frameworks[fw_i];
    if(!bundles[cur_fw.name()] && cur_fw.isBundle){
      bundles[cur_fw.name()] = makeBundle(cur_fw.name(),cur_fw.bundleDeps,cur_fw.shouldPreload);
    } 
    if(cur_fw.isBundle){
      bundles[cur_fw.name()] = addToBundle(bundles[cur_fw.name()], cur_fw.orderedScripts, cur_fw.orderedStylesheets, cur_fw.resources);
      if(cur_fw.shouldPreload) { // if preload, mix in with mainBundle
        mainBundle = addToBundle(mainBundle,cur_fw.orderedScripts, cur_fw.orderedStylesheets, cur_fw.resources);
      }
    }
    else { // normal framework
      mainBundle = addToBundle(mainBundle,cur_fw.orderedScripts, cur_fw.orderedStylesheets, cur_fw.resources);
    }
  }
  
  html = this.server.files[this.name].symlink;
  
  // now parse bundles and save 'em
  this._saveBundles(bundles);
  
  // mainBundle save:
  stylesheet = new File({ path: that.name + '.css', framework: that,  handler: sharedHandlers.build(['join']), children: mainBundle.stylesheets });
  this._makeSaver(that,stylesheet)();
  
  mainBundle.scripts.unshift(this._createBundleInfo(bundles)); // add the bundle info up front
  
  script = new File({ path: that.name + '.js', framework: that, handler: sharedHandlers.build(['join']), children: mainBundle.scripts  });
  this._makeSaver(that,script)();
  
  // save resources
  if(mainBundle.resources) mainBundle.resources.forEach(function(resource){ that._makeSaver(that,resource)(); });
  
  if(!html) throw new Error("No app HTML file found, this means trouble!");
  html.content = this.rootContent(
    '<link href="' + that.urlPrefix + stylesheet.url() + '" rel="stylesheet" type="text/css">',
    '<script type="text/javascript" src="' + that.urlPrefix + script.url() + '"></script>'
  );
  this._makeSaver(that,html)();
  
};

App.prototype.wrapper = function(ary,wrapper){
  var i,len,ret = [];
  
  for(i=0,len=ary.length;i<len;i+=1){
    ret.push(wrapper + ary[i] + wrapper);
  }
  return ret;
};

App.prototype._createBundleInfo = function(bundles){ // create file with bundle info 
  var path, file, bundleInfo = [], curBundle, tmp,  i,
  content = 'var SC = SC || { BUNDLE_INFO: { ';
  
  for(path in bundles){
    curBundle = bundles[path];
    tmp = path + ': { loaded: false';
    if(curBundle.bundleDeps){
      tmp += ', requires: [';
      tmp += this.wrapper(curBundle.bundleDeps,"'").join(',') + '] ';
    }
    // Note: garcon doesn't yet support non combined builds, as soon as these are implemented, the following has to be adapted too!
    
    // add styles property to BUNDLEINFO, array with urls, in this case one with the combined sheets
    if(curBundle.stylesheets.length > 1){
      tmp += ", styles: ['" + path + ".css']";  
    }
    // add scripts property to BUNDLEINFO, array with urls, in this case one with the combined scripts
    if(curBundle.scripts.length > 0){
      tmp += ", scripts: ['" + path + ".js']";  
    }
    tmp += '}';
    bundleInfo.push(tmp);
  }
  content += bundleInfo.join(", ") + "} , LAZY_INSTANTIATION: {} };";
  file = new File({ 
    path: this.name + '_bundleInfo.js', 
    framework: this, 
    content: function(callback){ callback(null, content);}, 
    handler: sharedHandlers.build(['file']),
    isVirtual: true });
  return file;
  
};

App.prototype._saveBundles = function(bundles){
  var path, bundle,
      me = this,
      styleSheet, script, resources;
  
  var makeFile = function(path,children){
    return new File({
      path: path,
      framework: me,
      handler: sharedHandlers.build(['join']),
      children: children
    });
  };
  
  for(path in bundles){
    if(!bundles[path].shouldPreload){ // don't save bundles that are preloaded
      styleSheet = makeFile((path + '.css'),bundles[path].stylesheets);
      script = makeFile((path + '.js'),bundles[path].scripts);
      this._makeSaver(me,styleSheet)();
      this._makeSaver(me,script)();
      resources = bundles[path].resources;
      l.sys.puts('resources in bundle ' + path + ": " + l.sys.inspect(bundles[path].resources));
      if(resources && (resources.length > 0)) resources.forEach(function(resource){ me._makeSaver(me,resource)(); });
    }
  }
};

App.prototype._makeSaver = function(app, file) {
  return function() {
    file.handler.handle(file, null, function(r) {
      var path;
      
      if (r.data.length > 0) {
        path = l.path.join(app.savePath, file.savePath());

        File.createDirectory(l.path.dirname(path));
        l.fs.writeFile(path, r.data, function(err) {
          if (err) throw err;
        });
      }
    });
  };
};

*/


