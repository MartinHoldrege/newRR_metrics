/*
Script started 12/2/2022 by Martin Holdrege

Purpose--summarise landcover datasets by a classification raster 

Details:
for each combination of suid (RR simulation unit ids from daniel) and specific years
burned and the burn severity in those years (denoted by suidBinSevSimple id), 
calculate the mean cover for RAP layers for each
year in the time period. 

Also output the amount of area belonging to each suidBinSevSimple
*/


// Constants

var pathAsset = 'projects/gee-guest/assets/newRR_metrics/';
var scale = 30;
var testRun = true; // false; // is this just a test run--if so code run for a very small area
var runExports = false; // whether to export csv files
var startYear = 1986;
var endYear = 2020;
var date = '20221202'; // to be included output in file names
var crs = 'EPSG:5070'; // projection for output rasters

// dependencies

// functions from the cheatgrass fire repository
var fnsC = require("users/mholdrege/cheatgrass_fire:src/ee_functions.js");

var fns = require("users/mholdrege/newRR_metrics:src/functions.js");

/***************************

load the data 

****************************
*/

// suid--data layer from Daniel Schlaepfer. This is an 'id' layer, where each pixel
// has a number which corresponds to the nrcs soil unit polygon that it belongs to. 
// resolution is 30 m. Certain 'non drylands' have been masked out for this analysis. 

var suid1 = ee.Image(pathAsset + 'suid/gsu_masked_v20220314')
  .rename('suid')
  .toDouble() // b/ later create very long numeric codes. 
  //.reproject(crs);

Map.addLayer(suid1, {min: 0, max: 100000}, 'suid', false);

var mask = suid1.neq(0).unmask().rename('mask');
Map.addLayer(mask, {min: 0, max: 1, palette: ['white', 'black']}, 'mask', false);
// region of interest

var biome = ee.FeatureCollection("projects/gee-guest/assets/SEI/US_Sagebrush_Biome_2019"); // provided by DT


if (testRun) {
 
  // test geometry that includes 1986 fires (which are causing problems)
  var region = 

    ee.Geometry.Polygon(
        [[[-112.6, 39.7],
          [-112.6, 39.63],
          [-112.45, 39.63],
          [-112.45, 39.7]]], null, false);
} else {
  var region = biome.geometry();
}

Map.addLayer(region, {}, 'roi', false);

// fire data

// image created in 01_compile_mtbs_fire_data.js
// tells you which years a given pixel burned, based on its binary code
// and the fire severities (1-5) for each of those years
// note that this image doesn't actually contain the binary code (for years burned)
// and base5 code for fire severity, but a shorter
// number, the keys to lookup what the associated binary and base5 codes can be found
// in tablse outputed by that same script
var binSevSimple = ee.Image(pathAsset + 'fire/mtbs_binSevSimpleM_1986_2020_30m_testRun20221202');


// rap cover data

/*
These data represent an update to the rangeland cover estimates described in
Allred et al. (2021).

Band 1 - annual forb and grass
Band 2 - bare ground
Band 3 - litter
Band 4 - perennial forb and grass
Band 5 - shrub
Band 6 - tree

No Data value = 255
*/

var rapCov1 = ee.ImageCollection('projects/rangeland-analysis-platform/vegetation-cover-v3');

var rapCov2 = rapCov1
  .filterDate(startYear + '-01-01', endYear + '-12-31')
  .filterBounds(region);

//print(rapCov2)
//print(rapCov2.bandNames())

var years = ee.List.sequence(startYear, endYear);
Map.addLayer(binSevSimple, {min:0, max: 10^5, palette: ['Black']}, 'binSevSimple', false);

/*

Functions

*/

// creating new version of the function so that region and scale
// don't need to be specified (those in the environment are used)
var mapOverYears = function(ic, bandName, groupName) {
  return fns.mapOverYears(ic, bandName, groupName, years, region, scale);
};

/*

combine suid (simulation unit) and binSev (when fires happened and their severity)

*/

var suidLong = suid1
  // original suid's go from ~1 to ~100k, now add 100k, so that all id's
  // have the same number of digits (so can later be extracted from a code)
  .add(ee.Number(100000))
  .toDouble() // so that no digits are lost (ie enough precision)
  // adding lagging zeroes so can add to bin simple
  .multiply(ee.Number(10).pow(8));
 
if(testRun) {
  Map.addLayer(suidLong, {palette: 'black'}, 'suid Long', false);
} 


// combined suid and cwf binary codes
var suidBinSevSimple = suidLong
  .mask(mask)
  // first 6 digits are by suid the remaning 5 are the the simple fire binary code.
  .add(binSevSimple.toDouble().mask(mask))
  .rename('suidBinSevSimple');


/*
Area by suidBin
Calculating the area of pixels falling in each combination of fire years and
simulation id. 
*/

var areasFc = fns.areaByGroup(suidBinSevSimple, 'suidBinSevSimple', region, scale) ;

if(testRun) {
  print('areas fc', areasFc);
}

/*

RAP cover by year and suid and bin

calculating the average cover each year, for each suidBin (i.e. the pixels)
*/


// testing data validity

var nYears = years.length().getInfo();
var nImages = rapCov2.size().getInfo();

if(nYears != nImages) {
  throw new Error('Rap dataset and years vector not the same length');
}

var rapCov3 = rapCov2.map(function(x) {
  return ee.Image(x).addBands(suidBinSevSimple).mask(mask);
});

print(rapCov3);

// annuals
var meanAFGfc = mapOverYears(rapCov3, 'AFG', 'suidBinSevSimple');

// perennials
var meanPFGfc = mapOverYears(rapCov3, 'PFG', 'suidBinSevSimple');

// shrubs
var meanSHRfc = mapOverYears(rapCov3, 'SHR', 'suidBinSevSimple');
 
// trees
var meanTREfc = mapOverYears(rapCov3, 'TRE', 'suidBinSevSimple');

// objects to output
var rapOut = [
  ['AFG', meanAFGfc],
  ['PFG', meanPFGfc],
  ['SHR', meanSHRfc],
  ['TRE', meanTREfc]
  ];

/*

Save output

*/

if(testRun) {
  var date = 'testRun' + date;
  
  print('meanAFGfc', meanAFGfc);
}

var s = '_' + startYear + '_' + endYear + '_' + scale + 'm_' + date;

// area of each suidBin
if (runExports) {
  
  // suidBinSimple raster
  Export.image.toDrive({
    image: suidBinSevSimple,
    description: 'suidBinSevSimple_mtbs' + s,
    folder: 'newRR_metrics',
    maxPixels: 1e13, 
    scale: scale,
    region: region,
    crs: crs,
    fileFormat: 'GeoTIFF'
  });
    
    // area
  Export.table.toDrive({
    collection: areasFc,
    description: 'area-by-suidBinSevSimple_mtbs' + s,
    folder: 'newRR_metrics',
    fileFormat: 'CSV'
  });

  // RAP--summarized cover
  // looping through functional types
  for (var i=0; i < rapOut.length; i++) {
    Export.table.toDrive({
      collection: rapOut[i][1],
      description: 'RAP_' + rapOut[i][0] + '-by-suidBinSevSimple-year_mtbs' + s,
      folder: 'newRR_metrics',
      fileFormat: 'CSV'
    });
  }
}