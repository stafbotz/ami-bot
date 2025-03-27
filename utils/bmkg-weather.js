import weather from 'weather-js'

weather.find({search: 'Dolok Merawan', degreeType: 'C'}, function(err, result) {
    if(err) console.log(err);
   
    console.log(JSON.stringify(result, null, 2));
  });