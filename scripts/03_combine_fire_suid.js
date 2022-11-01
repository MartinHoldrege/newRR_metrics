/*
Script started 9/8/2022 by Martin Holdrege

Purpose--summarise landcover datasets by a classification raster (i.e. each pixel
belongs to one of ~100k unique soil units)


*/


/*
Some notes (9/19/2022)

1979---2020 (is the range they're simulating for)

each year avg cover, for each year*identifier

seperate dataframe
% burned of that identifier for that year. 

seperate dataset--just looking at fires
for each combination of simulation unit and fire get
the average cover for that polygon for each year. also
year for each fire id, and area of each polygon. 

first create new fire polygon layer which is each unique combination of fires.

Then each combination of simulation unit and fire unit. 
Then get data for each of those. 


Next step--some suidBins contain 0 bins when outputted--this suggests there
is an issue with the workflow below (or unwanted rounding), either way it needs
to be fixed (also no data from 1986 showing up?)--confirm if this has been 
fixed--this was an issue with lack of precision of large numbers
*/


// Constants

var pathAsset = 'projects/gee-guest/assets/newRR_metrics/';
var scale = 30;
var testRun = false; // false; // is this just a test run--if so code run for a very small area
// the way the code is currently designed it will only work for up to 35 year period
// (due to how the unique codes for each fire/year and suid combo are created)
var runExports = true; // whether to export csv files
var startYear = 1986;
var endYear = 2020;

// dependencies

// functions from the cheatgrass fire repository
var fnsC = require("users/mholdrege/cheatgrass_fire:src/ee_functions.js");


/***************************

load the data 

****************************
*/

// suid--data layer from Daniel Schlaepfer. This is an 'id' layer, where each pixel
// has a number which corresponds to the nrcs soil unit polygon that it belongs to. 
// resolution is 30 m. Certain 'non drylands' have been masked out for this analysis. 

var suid1 = ee.Image(pathAsset + 'suid/gsu_masked_v20220314')
  .rename('suid')
  .toInt64(); // 64bit b/ later create very long numeric codes. 

Map.addLayer(suid1, {min: 0, max: 100000}, 'suid', false);

var mask = suid1.unmask().neq(0).rename('mask');
Map.addLayer(mask, {min: 0, max: 1, palette: ['white', 'black']}, 'mask', false);
// region of interest

var biome = ee.FeatureCollection("projects/gee-guest/assets/SEI/US_Sagebrush_Biome_2019"); // provided by DT


if (testRun) {
 
  // test geometry that includes 1986 fires (which are causing problems)
  var region = 

    ee.Geometry.Polygon(
        [[[-112.57779075073331, 39.72923042941417],
          [-112.57779075073331, 39.62353336440481],
          [-112.41024924682706, 39.62353336440481],
          [-112.41024924682706, 39.72923042941417]]], null, false);
} else {
  var region = biome.geometry();
}

Map.addLayer(region, {}, 'roi', false);

// fire data

// image created in 02_compile_fire_data.js
// tells you which years a given pixel burned, based on its binary code
// note that this image doesn't actually contain the binary code, but a shorter
// number, the key to lookup what the associated binary code is can be found
// in a table outputed by that same script
var binSimpleImageM = ee.Image(pathAsset + 'fire/cwf_binSimpleM_1986_2020_30m_20221031')

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


/*

Functions

some functions here rely on objects in the global environment (hence they can't be put in a seperate
script and be sourced)
*/

var meanBySuidBin = function(image, bandName) {

  // this creates a dictionary, mean value of the image for each
  // unique set of pixels (as defined by suidBin)
  var meanDict = ee.Image(image).select(bandName, 'suidBinSimple').reduceRegion({
    reducer: ee.Reducer.mean().group({
      groupField: 1,
      groupName: 'suidBinSimple',
    }),
    geometry: region,
    scale: scale,
    maxPixels: 1e12
  });
  
  // return a list where each element is a feature
  // that contains the mean cover value, name of the image band the mean is of
  // the suidBin, and the year the image is from
  var meanList = ee.List(meanDict.get('groups')).map(function (x) {
    var f = ee.Feature(null, 
      // using this code here to rename the parts as needed
        {suidBinSimple: ee.Number(ee.Dictionary(x).get('suidBinSimple')).toInt64(),
      // area in m^2
        meanValue: ee.Dictionary(x).get('mean'),
        bandName: bandName,
        year: ee.Image(image).get('year')
      });
    return f;
    });
  
  return ee.FeatureCollection(meanList);
};

// create feature collection where each feature is the mean cover for each year and suidbin
// ic: image collection (e.g. RAP)
// bandName: string, name of the band to take means of 
var mapOverYears = function(ic, bandName) {
  
  // mapping over years not the ic because mapping over an ic
  // requires the output to be a feature or an image
  // avoiding using toList() b/ of memory issues
  var fc = years.map(function(year){
    var image = ic// image collection (i.e. rap cover)
      .filter(ee.Filter.eq('year',year)).first();
    
    // of features providing mean cover for a given suid
    var out = meanBySuidBin(ee.Image(image), bandName);
    
    return out;
  });

  return ee.FeatureCollection(fc).flatten();
};


/*

Prepare fire data for summarizing

*/

var years = ee.List.sequence(startYear, endYear);
Map.addLayer(binSimpleImageM, {min:0, max: 10^5, palette: ['Black']}, 'fires all yrs', false);


/*

combine suid and bin

*/

var suidLong = suid1
  // original suid's go from ~1 to ~100k, now add 100k, so that all id's
  // have the same number of digits (so can later be extracted from a code)
  .add(ee.Number(100000))
  .toDouble() // so that no digits are lost (ie enough precision)
  // adding lagging zeroes so can add to bin simple
  .multiply(ee.Number(10).pow(5));
 
if(testRun) {
  Map.addLayer(suidLong, {}, 'suid Long', false);
} 

var maskFire = binSimpleImageM.gte(1);

// combined suid and cwf binary codes
var suidBinSimple = suidLong
  // updating mask so that only adding together areas that have an suid & that have burned
  .updateMask(maskFire)
  // first 6 digits are by suid the remaning 5 are the the simple fire binary code.
  .add(binSimpleImageM.toDouble())
  .rename('suidBinSimple');

/*

Area by suid and bin

Calculating the area of pixels falling in each combination of fire years and
simulation id. 
*/

/*
Area by suidBin
Calculating the area of pixels falling in each combination of fire years and
simulation id. 
*/

var areaImage = ee.Image.pixelArea()
  .addBands(suidBinSimple);
 
var areas = areaImage.reduceRegion({
      reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'suidBinSimple',
    }),
    geometry: region,
    scale: scale,
    maxPixels: 1e12
    }); 


// converting dictionary to a feature collection so that it can be output
// to a csv

// list where each component is a feature
var areasList = ee.List(areas.get('groups')).map(function (x) {
  return ee.Feature(null, 
  // using this code here to rename the parts as needed
  {suidBinSimple: ee.Number(ee.Dictionary(x).get('suidBinSimple')).toInt64(),
  // area in m^2
    area_m2: ee.Dictionary(x).get('sum')
  });
});

var areasFc = ee.FeatureCollection(areasList);


if(testRun) {
  print('areas fc', areasFc);
}


/*

RAP cover by year and suid and bin

calculating the average cover each year, for each suidBin (i.e. the pixels)
*/


var maskSuidBinSimple = suidBinSimple.gte(0).unmask(); 

// testing data validity

var nYears = years.length().getInfo();
var nImages = rapCov2.size().getInfo();

if(nYears != nImages) {
  throw new Error('Rap dataset and years vector not the same length');
}

var rapCov3 = rapCov2.map(function(x) {
  return ee.Image(x).addBands(suidBinSimple).mask(maskSuidBinSimple);
});

print(rapCov3);


// annuals
var meanAFGfc = mapOverYears(rapCov3, 'AFG');

// perennials
var meanPFGfc = mapOverYears(rapCov3, 'PFG');

// shrubs
var meanSHRfc = mapOverYears(rapCov3, 'SHR');

// trees
var meanTREfc = mapOverYears(rapCov3, 'TRE');


/*

Save output

*/

var date = '20220926'; // to be included in file names

if(testRun) {
  var date = 'testRun' + date;
  print(areasFc);
  print('meanAFGfc', meanAFGfc);
}

var s = '_' + startYear + '_' + endYear + '_' + scale + 'm_' + date;
// area of each suidBin
if (runExports) {

  // area
  Export.table.toDrive({
    collection: areasFc,
    description: 'area-by-suidBinSimple' + s,
    folder: 'newRR_metrics',
    fileFormat: 'CSV'
  });

  
  // RAP--summarized cover
    Export.table.toDrive({
    collection: meanAFGfc,
    description: 'RAP_AFG-by-suidBinSimple-year' + s,
    folder: 'newRR_metrics',
    fileFormat: 'CSV'
  });
}






