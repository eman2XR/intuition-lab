 'doppler':{draw:drawDoppler,touch:DOPPLER_TOUCH,demo:false,tone:true,a:['Siren’s speed','how fast the ambulance drives'],b:['Unused','',''],
  fa:a=>Math.round(dopplerSpeed(a)*3.6)+' km/h',fb:b=>'',
  // The modelled effect for the render checks: how much higher the note ahead of the siren is than its own note.
  effect:a=>Physics.dopplerHeard(Physics.sirenNote,dopplerSpeed(a),0)-Physics.sirenNote,
  measure:null,scale:'',
  disclosure:'A siren of 700 squeezes of the air a second on an ambulance at 30 metres a second (108 km/h), in still air at 20 °C, where sound travels 343 metres a second. One ring is drawn for every ten squeezes. The pictures run slower than real time (the pictures with rings 24 times slower); the rings’ spacing and the ambulance’s speed keep their true proportions.',
  try:'',aria:'An ambulance drives along a street seen from above, its siren sending out rings of squeezed air that spread at the speed of sound from wherever the siren was. The rings bunch up ahead of it and spread out behind, so a listener ahead hears 767 squeezes a second and one behind hears 644, against the siren’s own 700. As it passes a listener beside the road, the note heard slides from high to low.'},
