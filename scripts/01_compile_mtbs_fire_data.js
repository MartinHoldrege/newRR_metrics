/*

Purpose: Compile monitoring trends in burn severity data set over 35 years
so that each pixel has a binary code that denotes which year(s)
that pixel burned, and at which burn severity. Then replace that bin code with a 'simple'
shorter code (fewer digits) so don't run out of numeric precision, ]
in downstream scripts.  also create a key between the bin id and the
new simple id. 

Author: Martin Holdrege

Started: 11/29/2022

*/


// Constants

var pathAsset = 'projects/gee-guest/assets/newRR_metrics/';
var scale = 30;
var startYear = 1986;
var endYear = 2020;
var testRun = true; // is this just a test run?
var runExports = true; //export assets?
var date = "20221129"; // for appending to output names

// dependencies

var crs = 'EPSG:5070';
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

// burn severity
// fire polygons
// combined wildland fire dataset (from USGS--combines 40 different data sources)

var mtbs1 = ee.ImageCollection("USFS/GTAC/MTBS/annual_burn_severity_mosaics/v1")
  .filterDate(startYear + "-01-01", endYear + "-12-31")
  .filterBounds(region);
  
Map.addLayer(mtbs1, {}, 'mtbs', false);


/*

Prepare fire data for summarizing

*/

// adding year as a property
var mtbs2 = mtbs1.map(function(x) {
  var year = ee.Date(ee.Image(x).get('system:time_start'))
    .format("YYYY");
  var out = ee.Image(x).set("year", ee.Number.parse(year));
  return out;
});

// create binImage where each pixel is a code telling which years burned

// create list of years
var years = ee.List.sequence(startYear, endYear);
var yearsCount = ee.List.sequence(1, ee.Number(years.length()));

var mtbsImageByYear = mtbs2.map(function(x) {
  var out = ee.Image(x)
  // pixels that are within fire perimeters (i.e. not background or
  // non-mapping, are changed to), are change to 1, otherwise 0
    .remap([0, 1, 2, 3, 4, 5, 6], [0, 1, 1, 1, 1, 1, 0])
    .rename('fire')
    .toDouble();
  return out;
});


// in the year 1 image areas that burned are 1 (2^0)
// in year 2 they are 2 (2^1), in year 3 they are 4 (2^2), ...,
// etc until 2^34 (assuming 35 yrs total)
var mtbsBinImageByYear = mtbsImageByYear.map(function(x) {
  var image = ee.Image(x);
  var yearCount = ee.Number(image.get('year'))
    .subtract(ee.Number(startYear));
  var multiplier = ee.Number(2).pow(yearCount);
  var out = image.multiply(multiplier);
  return out; 
});


// summing across years the pixels that burned.
// this creates a code, where converting the code from
// integer  to binary (base 2) will tell you what year(s) burned.
// for example if the value of a pixel is 9 that would mean that year 1 and year 4 burned
// because 9 written in binary is 0000001001, where 1's denote years that burned and 0's denote
// years that didn't burn 
var mtbsBinImage = ee.ImageCollection(mtbsBinImageByYear).sum();

var mtbsBinImageM = mtbsBinImage
  .unmask() // unburned areas become 0
  .mask(mask) // only including areas that have suid
  .rename('bin');
  
// get all the unique 'binary' fire-year codes
//(https://gis.stackexchange.com/questions/403785/finding-all-unique-values-in-categorical-image)
var reduction = mtbsBinImageM.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(), 
  geometry: region,
  scale: scale,
  maxPixels: 1e11
});

var binUnique = ee.Dictionary(reduction.get(mtbsBinImageM.bandNames().get(0)))
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

var binSimpleM = mtbsBinImageM
  .remap(binUnique, binSimple)
  .rename('binSimple');


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

if (testRun) {
  print('binkey', binKeyFc);
}


// for each bin (or equivelantly bin simple), determine the burn severity sequence
// eventually want to seperate pixels that say burned in say both 2000 and 2010 and
// with burn severities of 2 and 3 vs 2 and 4 respectively. 

var mtbs3= mtbs2.map(function(x) {
  var out = ee.Image(x)
  // pixels that are not in a perimeter (codes 0 and 6), become 0
    .remap([1, 2, 3, 4, 5], [1, 2, 3, 4, 5], 0)
    .rename("Severity");
  return out;
});


// /*

// Save output

// */



// if(testRun) {
//   var date = 'testRun' + date;
// }

// var s = '_' + startYear + '_' + endYear + '_' + scale + 'm_' + date;

// if(runExports) {
  
// // key of binary fire code (i.e. so can determine which years actually burned)
// // and the simple (lower value )
// Export.table.toDrive({
//   collection: binKeyFc,
//   description: 'key_binary-fire-code_simple' + s,
//   folder: 'newRR_metrics',
//   fileFormat: 'CSV'
// });

// // here the 'm' in the file name stands for masked--i.e. areas for which suid not 
// // available are masked out
// Export.image.toAsset({ 
//   image: binSimpleImageM, 
//   assetId: pathAsset + 'fire/cwf_binSimpleM' + s ,
//   description: 'cwf_binSimpleM' + s ,
//   maxPixels: 1e13, 
//   scale: scale, 
//   region: region,
//   crs: crs
// });

// }


