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

// NEXT--figure out crs problem so that the saved asset matches up
// with the suid raster. read in re-projected suid file, and use that layer throughout
// as well as the mtbs wkt

// Constants

var pathAsset = 'projects/gee-guest/assets/newRR_metrics/';
var scale = 30;
var startYear = 1986;
var endYear = 2020;
var testRun = true; // is this just a test run?
var runExports = false; //export assets?
var date = "20221212"; // for appending to output names


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
// this version of the file has been re-projected to the same projection as MTBS

var suid1 = ee.Image(pathAsset + 'suid/gsu_masked_v20220314_wktUSGS')
  .rename('suid');

var mask = suid1.unmask().neq(0).rename('mask');
Map.addLayer(mask, {min: 0, max: 1, palette: ['white', 'black']}, 'mask', false, 0.5);
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

if(testRun) {
  print('suid projection', suid1.projection(), 
        'mtbs proj', mtbs1.first().projection());
}


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
    

// creating a new 'binSimple' which is a smaller number based on the
// actual number of unique bins. bin of 0 means nothing burned, and this
// should also be represented by a binSimple 'key' of 0. 
var binSimpleSeq = ee.List.sequence(ee.Number(0), ee.Number(binUnique.length()).subtract(1));

var binSimple = mtbsBinImage
  .remap(binUnique, binSimpleSeq)
  .rename('binSimple');


// create key of bin (ie the actual binary code) and binSimple
var binKey = binUnique.zip(binSimpleSeq)
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
var sevBase5 = ee.ImageCollection(sevBase5ByYear)
// removing mask so also sum across pixels that never burned (i.e. sevBase5 should be 0)
  .map(function(x) {
    return ee.Image(x).unmask();
  })
  .sum()
  .mask(mask);


/*
Create a key for sevBase5
(i.e. the key that gives the order of fire severities, and a sequence from 0 to the number of )

*/

var reductionSev = sevBase5.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(), 
  geometry: region,
  scale: scale,
  maxPixels: 1e11
});

var base5Unique = ee.Dictionary(reductionSev.get(sevBase5.bandNames().get(0)))
    .keys()
    .map(ee.Number.parse)
    .sort();
    

// creating a new 'sevSimple' which is a smaller number based on the
// actual number of unique sevBase5. 
var sevSimpleSeq = ee.List.sequence(ee.Number(0), ee.Number(base5Unique.length()).subtract(1));

// image but with the 'simple' key (the point is that these will be lower numbers)
var sevSimple = sevBase5
  .remap(base5Unique, sevSimpleSeq)
  .rename('sevSimple');


// create key of severity (ie the actual base 5 code) and sevSimple
var sevKey = base5Unique.zip(sevSimpleSeq)
  .map(function(x) {
    var f = ee.Feature(null, 
      // using this code here to rename the parts as needed
        {sevBase5: ee.List(x).get(0),
        sevSimple: ee.List(x).get(1)
      });
    return f;
  });

var sevKeyFc = ee.FeatureCollection(sevKey);

if (testRun) {
  print('sevkey', sevKeyFc);
}

// combine binSimple (which years burned) and sevSimple (what the intensities were)
var binSimpleSevSimple = binSimple
  .add(ee.Image(ee.Number(10).pow(4))) // adding so that all binSimple values are the same number of digits max should be around 5k)
  .multiply(ee.Image(ee.Number(10).pow(8))) // create space for the sevSimple 
  .add(sevSimple);
  
// now creating a key between binSimpleSevSimple and binSevSimple 
var reductionBinSev = binSimpleSevSimple.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(), 
  geometry: region,
  scale: scale,
  maxPixels: 1e11
});

var binSevUnique = ee.Dictionary(reductionBinSev.get(binSimpleSevSimple.bandNames().get(0)))
    .keys()
    .map(ee.Number.parse)
    .sort();

var binSevSimpleSeq = ee.List.sequence(ee.Number(1), ee.Number(binSevUnique.length()));

// image but with the 'simple' key (the point is that these will be lower numbers)
var binSevSimple = binSimpleSevSimple
  .remap(binSevUnique, binSevSimpleSeq)
  .rename('binSevSimple');

Map.addLayer(binSevSimple, {palette: 'red'}, "binSevSeimple", false, 0.5);
var binSevKey = binSevUnique.zip(binSevSimpleSeq)
  .map(function(x) {
    
    var bs = ee.Number(ee.List(x).get(0))
      .toInt64()
      .format('%s');     // convert to string
      
    // not keeping the first number (index 0, its just a 1), the next 4
    // digits are the binSimple code
    var binSimple = ee.Number.parse(bs.slice(1, 5));
    
    // the remaining digits make up the sevSimple code
    var sevSimple = ee.Number.parse(bs.slice(5, 100));

    var f = ee.Feature(null, 
      // using this code here to rename the parts as needed
        {binSimpleSevSimple: bs,
        binSevSimple: ee.List(x).get(1),
      // including the following two elements
      // so that this key can more easily be matched
      // with the sevKey and binKey files
        binSimple: binSimple,
        sevSimple: sevSimple
      });
    return f;
  });

var binSevKeyFc = ee.FeatureCollection(binSevKey);

if (testRun) {
  
  print('binSevKey', binSevKeyFc);
}
  
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
  description: 'mtbs_key_binary-fire-code' + s,
  folder: 'newRR_metrics',
  fileFormat: 'CSV'
});

// key for severity fire code (i.e. order of severity of the fires)
Export.table.toDrive({
  collection: sevKeyFc,
  description: 'mtbs_key_severity-fire-code' + s,
  folder: 'newRR_metrics',
  fileFormat: 'CSV'
});


Export.table.toDrive({
  collection: binSevKeyFc,
  description: 'mtbs_key_binary-severity-fire-code' + s,
  folder: 'newRR_metrics',
  fileFormat: 'CSV'
});

// here the 'M' in the file name stands for masked--i.e. areas for which suid not 
// available are masked out
Export.image.toAsset({ 
  image: binSevSimple, 
  assetId: pathAsset + 'fire/mtbs_binSevSimpleM' + s ,
  description: 'mtbs_binSevSimpleM' + s ,
  maxPixels: 1e13, 
  scale: scale, 
  region: region,
  crs: fns.wkt
});

}


