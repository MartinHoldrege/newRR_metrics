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
to be fixed
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

var mask = suid1.unmask().neq(0);
Map.addLayer(mask, {min: 0, max: 1, palette: ['white', 'black']}, 'mask', false);
// region of interest

var biome = ee.FeatureCollection("projects/gee-guest/assets/SEI/US_Sagebrush_Biome_2019"); // provided by DT


if (testRun) {
  var region = /* color: #d63000 */ee.Geometry.Polygon(
        [[[-111.87737424895596, 41.756976770460874],
          [-111.87634428069424, 41.719573725767205],
          [-111.78811033294033, 41.716498534131],
          [-111.77197416350674, 41.754927852691175]]]);
} else {
  var region = biome.geometry();
}

Map.addLayer(region, {}, 'roi', false);

// fire polygons
// combined wildland fire dataset (from USGS--combines 40 different data sources)

var cwf1 = ee.FeatureCollection(pathAsset + 'usgs_combined_wildland_fire_complete')
  .filterBounds(region);
  
Map.addLayer(cwf1, {}, 'cwf', false);

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

print(rapCov2)
//print(rapCov2.bandNames())


/*

Functions

some functions here rely on objects in the global environment (hence they can't be put in a seperate
script and be sourced)
*/

var meanBySuidBin = function(image, bandName) {

  // this creates a dictionary, mean value of the image for each
  // unique set of pixels (as defined by suidBin)
  var meanDict = ee.Image(image).select(bandName, 'suidBin').reduceRegion({
    reducer: ee.Reducer.mean().group({
      groupField: 1,
      groupName: 'suidBin',
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
      {suidBin: ee.Number(ee.Dictionary(x).get('suidBin')).toInt64(),
      // area in m^2
        meanValue: ee.Dictionary(x).get('mean'),
        bandName: bandName,
        year: ee.Image(image).get('year')
      });
    return f;
    });
  
  return meanList;
};

// create feature collection where each feature is the mean cover for each year and suidbin
var mapOverYears = function(ic, bandName) {
  
  var fc = ic // image collection (i.e. rap cover)
    // creating list so that the output of map doesn't have to be an image or feature
    .toList(years.length()) 
    // list of lists where each list element is a list for a given year
    // of features giving mean cover for a given suid
    .map(function(image) {
      return meanBySuidBin(image, bandName);
    })
    // flatten so that features from different years are in the same list
    .flatten(); 
  
  return fc;
};


/*

Prepare fire data for summarizing

*/

var zero = ee.Image(0);
// create list of years
var years = ee.List.sequence(startYear, endYear);
var yearsCount = ee.List.sequence(1, ee.Number(years.length()));

// vector 2^0, 2^1...to 2^34 (ie the values of each 'place' on a binary scale)
var yearsBin = yearsCount.map(function(x) {
  var exponent = ee.Number(x).subtract(1);
  var out = ee.Number(2).pow(exponent);
  return out; 
});

print(yearsBin);


var cwfByYear = years.map(function(year) {
  return cwf1.filter(ee.Filter.eq('Fire_Yr', year));
});


// one image for each year 0 if unburned, 1 if burned
var cwfImageByYear = cwfByYear
  .map(function(fc) {
    return zero.paint(fc, 1).rename('fire');
  })
  .zip(years) // combine two lists into one (each element of list is a list w/ 2 elements)
  .map(fnsC.setTimeStart) //
  .map(function(image) {
    // unburned areas are masked
    return ee.Image(image).selfMask();
  });

Map.addLayer(ee.Image(cwfImageByYear.get(0)), {min:0, max: 1, palette: ['white', 'black']}, 'fires, yr 1', false);

// in the year 1 image areas that burned are 1 (2^0)
// in year 2 they are 2 (2^1), in year 3 they are 4 (2^2), ...,
// etc until 2^34 (assuming 35 yrs total)
var cwfBinImageByYear = cwfImageByYear
  .zip(yearsBin)
  .map(function(x) {
    var image = ee.Image(ee.List(x).get(0));
    var multiplier = ee.Number(ee.List(x).get(1));
    var out = image.multiply(multiplier).cast({'fire':'int64'});
    return out;
  });
  
  
// summing across years the pixels that burned.
// this creates a code, where converting the code from
// integer  to binary (base 2) will tell you what year(s) burned.
// for example if the value of a pixel is 9 that would mean that year 1 and year 4 burned
// because 9 written in binary is 0000001001, where 1's denote years that burned and 0's denote
// years that didn't burn 
var cwfBinImage = ee.ImageCollection(cwfBinImageByYear).sum();

var cwfBinImageM = cwfBinImage.mask(mask);
var maskFire = cwfBinImageM.unmask().neq(0); //1 for burned areas
Map.addLayer(cwfBinImageM, {palette: ['Black']}, 'fires all yrs', false);

/*

Combine fire data and suid

*/


var suidLong = suid1
  // original suid's go from ~1 to ~100k, now add 100k, so that all id's
  // have the same number of digits (so can later be extracted from a code)
  .add(ee.Number(100000).int64())
  .multiply(ee.Number(10).pow(11));
  
// combined suid and cwf binary codes
var suidBin = suidLong
  // updating mask so that only adding together areas that have an suid & that have burned
  .updateMask(maskFire)
  // first 6 digits are by suid the remaning 11 are the the fire binary code.
  // b/ there are only 11 digits of space, this code will break down if the sequence
  // of years is longer than 35 (ie 2^35 would fit, but could would run into problems
  // if it were 36 years). 
  .add(cwfBinImageM)
  .rename('suidBin')
  .int64();
  
Map.addLayer(suidBin, {palette: ['Black']}, 'suidBin', false);

/*

Area by suidBin

Calculating the area of pixels falling in each combination of fire years and
simulation id. 
*/

var areaImage = ee.Image.pixelArea().addBands(
      suidBin);
 
var areas = areaImage.reduceRegion({
      reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'suidBin',
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
  {suidBin: ee.Number(ee.Dictionary(x).get('suidBin')).toInt64(),
  // area in m^2
    area_m2: ee.Dictionary(x).get('sum')
  });
});

var areasFc = ee.FeatureCollection(areasList);


if(testRun) {
  print('areas fc', areasFc);
}

/*

RAP cover by year and suidBin

calculating the average cover each year, for each suidBin (i.e. the pixels)
*/

// mask of pixels that 1) burned at some point and 2) have and a simulation unit id
var maskSuidBin = suidBin.unmask().neq(0); 
// testing data validity

var nYears = years.length().getInfo();
var nImages = rapCov2.size().getInfo();

if(nYears != nImages) {
  throw new Error('Rap dataset and years vector not the same length');
}

var rapCov3 = rapCov2.map(function(x) {
  return ee.Image(x).addBands(suidBin).mask(maskSuidBin);
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

// combining all rap summaries into single fc
var meanRAPfc = ee.FeatureCollection(meanAFGfc)
  .merge(meanPFGfc)
  .merge(meanSHRfc)
  .merge(meanTREfc);
  
if(testRun) {
  // var test = meanBySuidBin(rapCov3.first(), 'AFG');
  // print('rap test', test);
  print('meanPFG', meanPFGfc);
  print('mean all RAP', meanRAPfc);
}


/*

Save output

*/

var date = '20220925'; // to be included in file names

// area of each suidBin
if (runExports) {

  // area
  Export.table.toDrive({
    collection: areasFc,
    description: 'area-by-suidBin_' + date,
    folder: 'newRR_metrics',
    fileFormat: 'CSV'
  });

  
  // RAP--summarized cover
    Export.table.toDrive({
    collection: meanRAPfc,
    description: 'RAP_cover-by-suidBin-year_' + date,
    folder: 'newRR_metrics',
    fileFormat: 'CSV'
  });
}






