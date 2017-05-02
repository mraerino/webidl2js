"use strict";

const conversions = require("webidl-conversions");

const utils = require("./utils");

function generateTypeConversion(name, idlType, argAttrs, customTypes) {
  const requires = {};
  let str = "";

  if (idlType.nullable) {
    str += `
  if (${name} === null || ${name} === undefined) {
    ${name} = null;
  } else {`;
  }

  if (idlType.generic === "sequence") {
    // sequence type
    generateSequence();
  } else if (idlType.generic === "record") {
    // record type
    generateRecord();
  } else if (idlType.generic === "Promise") {
    // Promise type
    generatePromise();
  } else if (idlType.generic === "FrozenArray") {
    // frozen array type
    generateFrozenArray();
  } else if (conversions[idlType.idlType]) {
    // string or number type compatible with webidl-conversions
    generateGeneric(`conversions["${idlType.idlType}"]`);
  } else if (customTypes.has(idlType.idlType)) {
    // dictionaries or interfaces
    const varName = `convert${idlType.idlType}`;
    requires[varName] = `require("./${idlType.idlType}").convert`;
    generateGeneric(varName);
  } else {
    // unknown
    // Try to get the impl anyway.
    str += `
  ${name} = utils.tryImplForWrapper(${name});`;
  }

  if (idlType.nullable) {
    str += `
  }`;
  }

  return {
    requires,
    body: str
  };

  function generateSequence() {
    str += `
  if (typeof ${name} !== "object") {
    throw new TypeError("The value provided is not an iterable object");
  } else {
    const V = [];
    const tmp = ${name};
    for (let nextItem of tmp) {`;

    const conv = generateTypeConversion("nextItem", idlType.idlType, [], customTypes);
    Object.assign(requires, conv.requires);
    str += conv.body;

    str += `
      V.push(nextItem);
    }
    ${name} = V;
  }`;
  }

  function generateRecord() {
    if (!idlType.nullable) {
      str += `
  if (${name} == null) {
    ${name} = Object.create(null);
  } else {`;
    }

    str += `
  if (typeof ${name} !== "object") {
    throw new TypeError("The value provided is not an object");
  } else {
    const result = Object.create(null);
    const keys = Object.getOwnPropertyNames(${name});
    for (let key of keys) {
      const desc = Object.getOwnPropertyDescriptor(${name}, key);
      if (desc && desc.enumerable) {
        let typedKey = key;
        let typedValue = ${name}[key];`;

    str += generateTypeConversion("typedKey", idlType.idlType[0], [], customTypes).body;

    const conv = generateTypeConversion("typedValue", idlType.idlType[1], [], customTypes);
    Object.assign(requires, conv.requires);
    str += conv.body;

    str += `
        result[typedKey] = typedValue;
      }
    }
    ${name} = result;
  }`;

    if (!idlType.nullable) {
      str += `
  }`;
    }
  }

  function generatePromise() {
    str += `
  ${name} = Promise.resolve(${name});`;
  }

  function generateFrozenArray() {
    generateSequence();
    str += `
  ${name} = Object.freeze(${name});`;
  }

  function generateGeneric(conversionFn) {
    const enforceRange = utils.getExtAttr(argAttrs, "EnforceRange");
    const clamp = utils.getExtAttr(argAttrs, "Clamp");
    const treatNullAs = utils.getExtAttr(argAttrs, "TreatNullAs");

    let optString = "";
    if (clamp) {
      optString = `, { clamp: true }`;
    } else if (enforceRange) {
      optString = `, { enforceRange: true }`;
    } else if (treatNullAs && treatNullAs.rhs.value === "EmptyString") {
      optString = `, { treatNullAsEmptyString: true }`;
    }
    if (conversions[idlType.idlType]) {
      conversionFn = `conversions["${idlType.idlType}"]`;
    } else {
      requires[`convert${idlType.idlType}`] = `require("./${idlType.idlType}").convert`;
      conversionFn = `convert${idlType.idlType}`;
    }
    if (idlType.array) {
      str += `
  for (let i = 0; i < ${name}.length; ++i) {
    ${name}[i] = ${conversionFn}(${name}[i]${optString});
  }`;
    } else {
      str += `
  ${name} = ${conversionFn}(${name}${optString});`;
    }
  }
}

module.exports = {
  generateTypeConversion
};