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
  
  // return a dictionary where each element is a feature
  // that contains the mean cover value, name of the image band the mean is of
  // the suidBin, and the year the image is from
  // not converting to ee.List to avoid unnecessary recasting 
  var meanDict2 = ee.Dictionary(meanDict.get('groups')).map(function(key, x) {
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
  
  return ee.FeatureCollection(meanDict2);
};

/**
 * Area of pixels belonging to each group
 * 
 * @param {ee.Image} image input that contains a grouping/classification/id band
 * @param {ee.String} groupName name of band that will be used for grouping (i.e. the ids)
 * @param (ee.Feature} region to apply reducer to
 * @param {ee.Number} scale to using when applying reducer 
 * 
 * @return {ee.FeatureCollection} area of each unique value in groupName
*/
exports.areaByGroup = function(image, groupName, region, scale) {
  var areaImage = ee.Image.pixelArea()
    .addBands(image.select(groupName));
 
  
  var areas = areaImage.reduceRegion({
        reducer: ee.Reducer.sum().group({
        groupField: 1,
        groupName: groupName,
      }),
      geometry: region,
      scale: scale,
      maxPixels: 1e12
      }); 
  
  
  // converting dictionary to a feature collection so that it can be output
  // to a csv
  
  // dictionary where each component is a feature
  var areasDict = ee.Dictionary(areas.get('groups')).map(function (key, x) {
    
    var dict = {area_m2: ee.Dictionary(x).get('sum')};
    
    // passing groupName as a variable to become the name in the dictionary
    dict[groupName] = ee.Number(ee.Dictionary(x).get(groupName)).toInt64();
    
    return ee.Feature(null, dict);
  });
  
  var areasFc = ee.FeatureCollection(areasDict);
  
  return areasFc;
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


// wkt 
// so can use the same projection in multiple places
var projUSGS = ee.Projection("PROJCS[\"USA_Contiguous_Albers_Equal_Area_Conic_USGS_version\", \n  GEOGCS[\"GCS_North_American_1983\", \n    DATUM[\"D_North_American_1983\", \n      SPHEROID[\"GRS_1980\", 6378137.0, 298.257222101]], \n    PRIMEM[\"Greenwich\", 0.0], \n    UNIT[\"degree\", 0.017453292519943295], \n    AXIS[\"Longitude\", EAST], \n    AXIS[\"Latitude\", NORTH]], \n  PROJECTION[\"Albers_Conic_Equal_Area\"], \n  PARAMETER[\"central_meridian\", -96.0], \n  PARAMETER[\"latitude_of_origin\", 23.0], \n  PARAMETER[\"standard_parallel_1\", 29.5], \n  PARAMETER[\"false_easting\", 0.0], \n  PARAMETER[\"false_northing\", 0.0], \n  PARAMETER[\"standard_parallel_2\", 45.5], \n  UNIT[\"m\", 1.0], \n  AXIS[\"x\", EAST], \n  AXIS[\"y\", NORTH]]")

var wktUSGS = exports.wktUSGS = projUSGS.wkt().getInfo();



