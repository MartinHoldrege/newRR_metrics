/*

Purpose: Compile combined wildland fire data set over 35 years
so that each pixel has a binary code that denotes which year(s)
that pixel burned. Then replace that bin code with a 'simple'
shorter code (fewer digits) so don't run out of numeric precision, ]
in downstream scripts.  also create a key between the bin id and the
new simple id. 

Author: Martin Holdrege

Started: 9/27/2022

*/


// Constants

var pathAsset = 'projects/gee-guest/assets/newRR_metrics/';
var scale = 30;
var startYear = 1986;
var endYear = 2020;
var testRun = false; // is this just a test run?
var runExports = true; //export assets?
var date = "20221104"; // for appending to output names

// dependencies

var crs = 'EPSG:4326'; // output set to WGS84, decimal degrees
var fnsC = require("users/mholdrege/cheatgrass_fire:src/ee_functions.js");

/***************************

load the data 

****************************
*/

// suid--data layer from Daniel Schlaepfer. This is an 'id' layer, where each pixel
// has a number which corresponds to the nrcs soil unit polygon that it belongs to. 
// resolution is 30 m. Certain 'non drylands' have been masked out for this analysis. 
// here just using this layer for masking

var suid1 = ee.Image(pathAsset + 'suid/gsu_masked_v20220314')
  .rename('suid');

var mask = suid1.unmask().neq(0).rename('mask');
Map.addLayer(mask, {min: 0, max: 1, palette: ['white', 'black']}, 'mask', false);
// region of interest

var biome = ee.FeatureCollection("projects/gee-guest/assets/SEI/US_Sagebrush_Biome_2019"); // provided by DT


if (testRun) {
  var region = 
    ee.Geometry.Polygon(
        [[[-112.57779075073331, 39.72923042941417],
          [-112.57779075073331, 39.62353336440481],
          [-112.41024924682706, 39.62353336440481],
          [-112.41024924682706, 39.72923042941417]]], null, false);
} else {
  var region = biome.geometry();
}


// fire polygons
// combined wildland fire dataset (from USGS--combines 40 different data sources)

var cwf1 = ee.FeatureCollection(pathAsset + 'usgs_combined_wildland_fire_complete')
  .filterBounds(region);
  
Map.addLayer(cwf1, {}, 'cwf', false);


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


var cwfByYear = years.map(function(year) {
  return cwf1.filter(ee.Filter.eq('Fire_Yr', year));
});

Map.addLayer(ee.FeatureCollection(cwfByYear.get(0)), {}, '1986');

// one image for each year 0 if unburned, 1 if burned
var cwfImageByYear = cwfByYear
  .map(function(fc) {
    return zero.paint(fc, 1).rename('fire');
  })
  .zip(years) // combine two lists into one (each element of list is a list w/ 2 elements)
  .map(fnsC.setTimeStart) //
  .map(function(image) {
    return ee.Image(image);
  });

//print('test', ee.FeatureCollection(cwfByYear.get(1)).first());
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
  

//Map.addLayer(ee.Image(cwfBinImageByYear.get(0)), {palette: 'black'}, 'bin 1986') 
// summing across years the pixels that burned.
// this creates a code, where converting the code from
// integer  to binary (base 2) will tell you what year(s) burned.
// for example if the value of a pixel is 9 that would mean that year 1 and year 4 burned
// because 9 written in binary is 0000001001, where 1's denote years that burned and 0's denote
// years that didn't burn 
var cwfBinImage = ee.ImageCollection(cwfBinImageByYear).sum();

// self mask here because summing acrros layers leads to 0s where
// all the layers were masked

var cwfBinImageM = cwfBinImage
  .unmask() // unburned areas become 0
  .mask(mask) // only including areas that have suid
  .rename('bin');
  
Map.addLayer(cwfBinImageM.gt(0).selfMask(), {palette: ['Red']}, 'burned areas', false);
Map.addLayer(cwfBinImageM.eq(0).selfMask(), {palette: ['White']}, 'un burned areas', false);

// get all the unique 'binary' fire-year codes
//(https://gis.stackexchange.com/questions/403785/finding-all-unique-values-in-categorical-image)
var reduction = cwfBinImageM.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(), 
  geometry: region,
  scale: scale,
  maxPixels: 1e11
});

var binUnique = ee.Dictionary(reduction.get(cwfBinImageM.bandNames().get(0)))
    .keys()
    .map(ee.Number.parse)
    .sort();
    
if(testRun) {
  print('unique bin vals', binUnique);
  print('length', binUnique.length());
  print(binUnique);
}


// creating a new 'binSimple' which is a smaller number based on the
// actual number of unique bins. bin of 0 means nothing burned, and this
// should also be represented by a binSimple 'key' of 0. 
var binSimple = ee.List.sequence(ee.Number(0), ee.Number(binUnique.length()).subtract(1));

var binSimpleImageM = cwfBinImageM
  .remap(binUnique, binSimple)
  .rename('binSimple')
  .int32(); // binSimple values aren't as large so int32 should suffice and save space

// create key of bin (ie the actual binary code) and binSimple
var binKey = binUnique.zip(binSimple)
  .map(function(x) {
    var f = ee.Feature(null, 
      // using this code here to rename the parts as needed
        {bin: ee.List(x).get(0),
        binSimple: ee.List(x).get(1)
      });
    return f;
  });

var binKeyFc = ee.FeatureCollection(binKey);

/*

Save output

*/



if(testRun) {
  var date = 'testRun' + date;
}

var s = '_' + startYear + '_' + endYear + '_' + scale + 'm_' + date;

if(runExports) {
  
// key of binary fire code (i.e. so can determine which years actually burned)
// and the simple (lower value )
Export.table.toDrive({
  collection: binKeyFc,
  description: 'key_binary-fire-code_simple' + s,
  folder: 'newRR_metrics',
  fileFormat: 'CSV'
});

// here the 'm' in the file name stands for masked--i.e. areas for which suid not 
// available are masked out
Export.image.toAsset({ 
  image: binSimpleImageM, 
  assetId: pathAsset + 'fire/cwf_binSimpleM' + s ,
  description: 'cwf_binSimpleM' + s ,
  maxPixels: 1e13, 
  scale: scale, 
  region: region,
  crs: crs
});

}


