/**
 * The ee module contains misc javascript functions for use
 * in other javascript earth engine scripts in this repository.
 * Module created by Martin Holdrege
 * 
 * load like this:
 * var fns = require("users/mholdrege/newRR_metrics:src/functions.js");
 * @module src/functions.js
 */
 

/**
 * Mask based on fireNum band
 * 
 *  mask the image, such that only unmasked pixels are those where
 * the fireNum band is equal to targetFireNum
 * 
 * 
 * @param {ee.Image} image to be masked, that includes a band called fireNum
 * @parm {ee.Number) targetFireNum 
 * @return {ee.Image}
 * 
*/
exports.maskByFireNum = function(image, targetFireNum) {
  var image2 = ee.Image(image);
  var mask = image2.select('fireNum')
    .eq(ee.Number(targetFireNum))
    .unmask();
    
  var out = image2.updateMask(mask);
  return out;
};