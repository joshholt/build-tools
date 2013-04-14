/*globals global __dirname */


var SC = require('sc-runtime'),
    lib_dir = __dirname,
    util = require('util'),
    http = require('http'),
    url = require('url'),
    path = require('path'),
    fs = require('fs'),
    qfs = require('./qfs'),
    cp = require('child_process'),
    //jslint = require('./jslint').JSLINT,
    log = util.log,
    inspect = util.inspect,
    puts = util.puts;

// String additions: 

String.prototype.gsub = function(re, callback, target) {
  var result = '',
      source = this,
      match;
  
  target = target || this;
  while (source.length > 0) {
    if (match = re.exec(source)) {
      result += source.slice(0, match.index);
      result += callback.call(target,match);
      source  = source.slice(match.index + match[0].length);
    } else {
      result += source;
      source = '';
    }
  }
  
  return result;
};

String.prototype.beginsWith = function(str){
  if(this.match(new RegExp("^" + str))) return true;
  else return false;
};

String.prototype.endsWith = function(str){
  if(this.match(new RegExp(str + "$"))) return true;
  else return false;
};

String.prototype.toShortLanguage = function() {
  var shortLanguages = {
    'english': 'en',
    'french': 'fr',
    'german': 'de',
    'japanese': 'ja',
    'spanish': 'es',
    'italian': 'it'
  };
  
  return shortLanguages[this];
};

/*
  Exports section
*/

exports.SC = SC;
exports.lib_dir = lib_dir;
exports.util = util;
exports.http = http;
exports.url = url;
exports.path = path;
exports.fs = fs;
exports.qfs = qfs;
exports.cp = cp;
//exports.jslint = jslint;
exports.log = log;
exports.inspect = inspect;
exports.puts = puts;
exports.ValidationError = SC.Error.extend({
  value: 400,
  label: "Validation Error",
  message: "Validation Error"
});

var createDirectory = function(p){
  var prefix = path.dirname(p);
  
  if(prefix !== "." && prefix !== "/"){
    createDirectory(prefix);
  }
  // make async!
  try {
    fs.mkdirSync(p, parseInt('0755',8));
  }
  catch(e){
    //this.log('constants is ' + this.inspect(CONSTANTS));
    //log('e is ' + inspect(e));
    //log('constants is ' + inspect(CONSTANTS));
    //if(e.errno !== CONSTANTS.EEXIST) throw e;
    if(e.code !== 'EEXIST') throw e;
  }
};

var createDir = function(p,callback){
  var creator = function(dir,cb){
    fs.mkdir(p, parseInt('0755',8),cb);
  };
  
  var prefix = path.dirname(p);
  if((prefix !== '.') && (prefix !== "/")){
    createDir(prefix, function(err){
      if(err){
        //log("creator cb error is: " + inspect(err));
        if(err.code !== 'EEXIST') throw err;
      }
      callback();
      //else creator(p,callback);
    });
  } 
  else {
    creator(p,callback);
  }
};

exports.createDirectory = createDirectory;
exports.createDir = createDir;

exports.rewriteSuper = function(str){
  if (/sc_super\(\s*[^\)\s]+\s*\)/.test(str)){
    util.puts('ERROR in ' + this._path + ': sc_super() should not be called with arguments. Modify the arguments array instead.'); 
  }
  if(str && str.replace){
    return str.replace(/sc_super\(\)/g, 'arguments.callee.base.apply(this,arguments)');
  }
};

// function to trigger a read action on all files in an array

exports.readFiles = function(filesArray,callback){
  var numFilesToRead = filesArray.length;
  var filesRead = 0;
  var filePaths = SC.Set.create();
  var ready = function(file){
    filePaths.remove(file.get('path'));
    if(filesRead === numFilesToRead && filePaths.get('length') === 0){
      callback();
    }
  };
  
  filesArray.forEach(function(f){
    if(f && f.get('isFile')){
      filePaths.push(f.get('path'));
      f.read(ready);      
    }
    else {
      numFilesToRead -= 1;
    }
  });
};


exports.loadPlugin = function(path){
  var Plugin;
  try {
    Plugin = require(path);
  }
  catch(e){
    puts("Problem loading plugin: " + path + ", error: " + inspect(e));
    return false;
  }
  return Plugin;
};
