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
var crs = 'EPSG:5070';

// dependencies

var fns = require("users/mholdrege/newRR_metrics:src/functions.js");

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
  .filterBounds(region)
  .map(function(x) {
    return ee.Image(x).updateMask(mask);
  });

  
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

/*

create binImage where each pixel is a code telling which years burned

*/

// create list of years
var years = ee.List.sequence(startYear, endYear);
var yearsCount = ee.List.sequence(1, ee.Number(years.length()));

var mtbsImageByYear = mtbs2.map(function(x) {
  var out = ee.Image(x)
  // pixels that are within fire perimeters (i.e. not background or
  // non-mapping, are changed to), are change to 1, otherwise 0
    .remap([0, 1, 2, 3, 4, 5, 6], [0, 1, 1, 1, 1, 1, 0])
    .rename('fire');
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
  var out = image
    .toDouble()
    .multiply(multiplier);
  return out; 
});


// summing across years the pixels that burned.
// this creates a code, where converting the code from
// integer  to binary (base 2) will tell you what year(s) burned.
// for example if the value of a pixel is 9 that would mean that year 1 and year 4 burned
// because 9 written in binary is 0000001001, where 1's denote years that burned and 0's denote
// years that didn't burn 
var mtbsBinImage = ee.ImageCollection(mtbsBinImageByYear)
  .sum()
  .unmask() // unburned areas become 0
  .mask(mask) // only including areas that have suid
  .rename('bin');


// get all the unique 'binary' fire-year codes
//(https://gis.stackexchange.com/questions/403785/finding-all-unique-values-in-categorical-image)
var reduction = mtbsBinImage.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(), 
  geometry: region,
  scale: scale,
  maxPixels: 1e11
});

var binUnique = ee.Dictionary(reduction.get(mtbsBinImage.bandNames().get(0)))
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

var binSimple = mtbsBinImage
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

/*

for each bin (or equivelantly bin simple), determine the burn severity sequence
eventually want to seperate pixels that say burned in say both 2000 and 2010 and
with burn severities of 2 and 3 vs 2 and 4 respectively. 

*/


var mtbs3= mtbs2.map(function(x) {
  var out = ee.Image(x)
  // pixels that are not in a perimeter (codes 0 and 6), become 0
    .remap([1, 2, 3, 4, 5], [1, 2, 3, 4, 5], 0)
    .rename("Severity");
  return out;
});


// if a given pixel burned burned that year, shows if this is the 1st, 2nd, 3rd etc. fire
var fireNum = years.map(function(yr) {

  var filteredCollection = mtbsImageByYear
    .filter(ee.Filter.lte('year', ee.Number(yr)));
    
  // image showing whether burned in current year
  var currentYear = ee.Image(mtbsImageByYear
    .filter(ee.Filter.eq('year', ee.Number(yr)))
    .first())
    .unmask();
    
  // cumulative number of fires that have occurred
  var cumulative = ee.Image(filteredCollection.sum());
  
  // if it burned that year, shows if this is the 1st, 2nd, 3rd etc. fire
  // for that pixel
  var out = cumulative
    .updateMask(currentYear)
    .rename('fireNum')
    // system properties needed so that image collections can be combined below
    .copyProperties(currentYear, ['year', 'system:index', 'system:time_start']);

  return out;
});

var fireNum = ee.ImageCollection(fireNum);

// combine band of severity with band showing the fire number (1st, 2nd, 3rd, etc.)
var mtbs4 = mtbs3.combine(fireNum);

// total number of times each pixel burned
var totalFires = mtbsImageByYear.sum()
  .rename('totalFires');

// max number of fires to have occurred in any grid cell
var maxFires =   totalFires.reduceRegion({
    reducer: ee.Reducer.max(),
    geometry: region,
    scale: scale, // to speed computation for now
    maxPixels: 1e12,
    bestEffort: true
  });
  
var maxFires = ee.Number(maxFires.get('totalFires')); // convert to a number

var numFireSeq = ee.List.sequence(ee.Number(1), maxFires);

if(testRun) {
  print("max num of fires", maxFires);
}

// image collection where first image shows fire severity for the first time a pixel burned
// 2nd image is the fire severity for the 2nd time a pixel burned, etc. 




var sevNumFire = numFireSeq.map(function(x) {

  var mtbsMasked = mtbs4.map(function(image) {
    return fns.maskByFireNum(ee.Image(image), ee.Number(x));
  });
  var out = mtbsMasked
    .select('Severity')
    // only one image will have non 0 severity values (assuming the pixel every burned x times)
    // so the sum is just to extract that value
    .sum() 
    .set("numFire", ee.Number(x));
  
  return out;
});

var sevNumFire = ee.ImageCollection(sevNumFire);

// fire severity of the first time a cell burned will be raised to 0,
// fire severity for 2nd time burned, is raised to 1 and so on
var sevBase5ByYear = sevNumFire.map(function(x) {
  var image = ee.Image(x);
  var exponent = ee.Number(image.get('numFire')).subtract(1);
  
  var out = image.pow(exponent)
    .rename('sevBase5');
  return out;
});

// a base 5 code that when decomposed provides the fire severity
// of each time the pixel burned (and binSimple images created above
// tell you which years the pixel burned)
var sevBase5 = ee.ImageCollection(sevBase5ByYear).sum();
print(sevBase5);

// CONTINUE HERE--

/*
Next steps
create key of sevBase5 to sevSimple
The create a sevSimple image
Then create an image summing together sevSimple and binSimple (
with sevSimple multiplied by 10^(x+1) where x is the maximum number of orders of magnitude of binSimple
then wher 10^x has bin added to bin simple (as was done with suid). 
then create an binsSimple-sevSimple image
then create a key between  binsSimple-sevSimple and a new key binSevSimple
create image of binSevSimple
output that image
as well as the 3 needed keys

*/

/*
Creat a key for sevBase5

*/

// var reductionSev = sevBase5.reduceRegion({
//   reducer: ee.Reducer.frequencyHistogram(), 
//   geometry: region,
//   scale: scale,
//   maxPixels: 1e11
// });

// var binUnique = ee.Dictionary(reduction.get(mtbsBinImage.bandNames().get(0)))
//     .keys()
//     .map(ee.Number.parse)
//     .sort();
    
// if(testRun) {
//   print('unique bin vals', binUnique);
//   print('length', binUnique.length());
//   print(binUnique);
// }


// // creating a new 'binSimple' which is a smaller number based on the
// // actual number of unique bins. bin of 0 means nothing burned, and this
// // should also be represented by a binSimple 'key' of 0. 
// var binSimple = ee.List.sequence(ee.Number(0), ee.Number(binUnique.length()).subtract(1));

// var binSimple = mtbsBinImage
//   .remap(binUnique, binSimple)
//   .rename('binSimple');


// // create key of bin (ie the actual binary code) and binSimple
// var binKey = binUnique.zip(binSimple)
//   .map(function(x) {
//     var f = ee.Feature(null, 
//       // using this code here to rename the parts as needed
//         {bin: ee.List(x).get(0),
//         binSimple: ee.List(x).get(1)
//       });
//     return f;
//   });

// var binKeyFc = ee.FeatureCollection(binKey);

// if (testRun) {
//   print('binkey', binKeyFc);
// }

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


