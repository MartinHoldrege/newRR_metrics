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

*/




// Constants

var pathAsset = 'projects/gee-guest/assets/newRR_metrics/';
var scale = 30;
var testRun = true; //is this just a test run--if so code run for a very small area

/***************************

load the data 

****************************
*/

// suid--data layer from Daniel Schlaepfer. This is an 'id' layer, where each pixel
// has a number which corresponds to the nrcs soil unit polygon that it belongs to. 
// resolution is 30 m. Certain 'non drylands' have been masked out for this analysis. 

var suid1 = ee.Image(pathAsset + 'suid/gsu_masked_v20220314')
  .rename('suid')
  .toInt(); // unique values so integer better?

Map.addLayer(suid1, {min: 0, max: 100000}, 'suid', false);

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

var rapCov2 = rapCov1.filterDate('2019-01-01', '2020-12-31').mean(); // for testing purposes just taking mean of last couple years

//print(rapCov2.bandNames())

/*

Prepare data for summarizing

*/

var rapCov3 = rapCov2.addBands(suid1);

print(rapCov3);

/*

summarizing by suid

*/

// the first band is the one that 
var afgM1 = rapCov3.select('AFG', 'suid').reduceRegion({
  reducer: ee.Reducer.mean().group({
    groupField: 1,
    groupName: 'suid',
  }),
  geometry: region,
  scale: scale,
  maxPixels: 1e12
});

if (testRun) {
  print(afgM1);
}




