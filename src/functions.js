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

/**
 * Means of one band by another grouping band
 * 
 * @param {ee.Image} image input image that contains at least two bands. must have 'year' property
 * @param {ee.String} bandName name of band to take mean of
 * @param {ee.String} groupName name of band that will be used for grouping (i.e. the ids)
 * @param (ee.Feature} region to apply reducer to
 * @param {ee.Number} scale to using when applying reducer 
 * 
 * @return {ee.FeatureCollection} feature collection giving mean values of bandName for 
 * each unique value in groupName
*/
var meanByGroup = exports.meanByGroup = function(image, bandName, groupName, region, scale) {

  // this creates a dictionary, mean value of the image for each
  // unique set of pixels (as defined by suidBin)
  var meanDict = ee.Image(image).select(bandName, groupName).reduceRegion({
    reducer: ee.Reducer.mean().group({
      groupField: 1,
      groupName: groupName,
    }),
    geometry: region,
    scale: scale,
    maxPixels: 1e12
  });
  
  // return a list where each element is a feature
  // that contains the mean cover value, name of the image band the mean is of
  // the suidBin, and the year the image is from
  var meanList = ee.List(meanDict.get('groups')).map(function (x) {
    var dict =       
        {
      // area in m^2
        meanValue: ee.Dictionary(x).get('mean'),
        bandName: bandName,
        year: ee.Image(image).get('year')
      };
      // adding element to dictionary this way b/ here groupName is a variable 
     dict[groupName] =  ee.Number(ee.Dictionary(x).get(groupName)).toInt64();
    var f = ee.Feature(null, dict);
    return f;
    });
  
  return ee.FeatureCollection(meanList);
};


/**
 * create feature collection where each feature is the mean value of a band
 * for each year and id (from bandName)
 * 
 * @param {ee.ImageCollection} image collection of yearly data (e.g. RAP), must have a
 * 'year' property
 * @param {ee.String} bandName name of band to take mean of
 * @param {ee.List} years list of years to map over
 * @param {ee.String} groupName name of band that will be used for grouping (i.e. the ids)
 * @param {ee.Feature} region to apply reducer to
 * @param {ee.Number} scale to using when applying reducer 
 * 
 * @return {ee.FeatureCollection} feature collection giving mean values of bandName for 
 * each unique value in groupName for each year 
*/
exports.mapOverYears = function(ic, bandName, groupName, years, region, scale) {
  
  // mapping over years not the ic because mapping over an ic
  // requires the output to be a feature or an image
  // avoiding using toList() b/ of memory issues
  var fc = years.map(function(year){
    var image = ic// image collection (i.e. rap cover)
      .filter(ee.Filter.eq('year',year)).first();
    
    // of features providing mean cover for a given suid
    var out = meanByGroup(ee.Image(image), bandName, groupName, region, scale);
    
    return out;
  });

  return ee.FeatureCollection(fc).flatten();
};

