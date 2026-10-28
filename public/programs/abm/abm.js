/**
 * abm.js — Anything But Metric (A.B.M.) Imperial Equivalency Engine
 *
 * Schematics & Architecture:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                    A.B.M. CONVERSION PIPELINE                           │
 * │  1. Mode Select     ──► [W]eight or [D]istance                          │
 * │  2. Input Parser    ──► Regex splits numeric value & unit token         │
 * │  3. Base Normalizer ──► Converts Weight -> lbs, Distance -> ft          │
 * │  4. Scale Matcher   ──► Selects from 200+ absurd reference items        │
 * │  5. Telemetry Print ──► Outputs formatted result + optional loop        │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ─── 1. Unit Normalization Tables ────────────────────────────────────────────
// All weights normalize to POUNDS (lbs).
const WEIGHT_UNITS = {
    oz:     { factor: 1 / 16, labelSingular: "ounce",  labelPlural: "ounces", abbr: "oz" },
    ounce:  { factor: 1 / 16, labelSingular: "ounce",  labelPlural: "ounces", abbr: "oz" },
    ounces: { factor: 1 / 16, labelSingular: "ounce",  labelPlural: "ounces", abbr: "oz" },

    lb:     { factor: 1,      labelSingular: "pound",  labelPlural: "pounds", abbr: "lbs" },
    lbs:    { factor: 1,      labelSingular: "pound",  labelPlural: "pounds", abbr: "lbs" },
    pound:  { factor: 1,      labelSingular: "pound",  labelPlural: "pounds", abbr: "lbs" },
    pounds: { factor: 1,      labelSingular: "pound",  labelPlural: "pounds", abbr: "lbs" },

    ton:    { factor: 2000,   labelSingular: "ton",    labelPlural: "tons",   abbr: "tons" },
    tons:   { factor: 2000,   labelSingular: "ton",    labelPlural: "tons",   abbr: "tons" },
};

// All distances normalize to FEET (ft).
const DISTANCE_UNITS = {
    in:     { factor: 1 / 12, labelSingular: "inch",   labelPlural: "inches", abbr: "in" },
    inch:   { factor: 1 / 12, labelSingular: "inch",   labelPlural: "inches", abbr: "in" },
    inches: { factor: 1 / 12, labelSingular: "inch",   labelPlural: "inches", abbr: "in" },
    '"':    { factor: 1 / 12, labelSingular: "inch",   labelPlural: "inches", abbr: "in" },

    ft:     { factor: 1,      labelSingular: "foot",   labelPlural: "feet",   abbr: "ft" },
    foot:   { factor: 1,      labelSingular: "foot",   labelPlural: "feet",   abbr: "ft" },
    feet:   { factor: 1,      labelSingular: "foot",   labelPlural: "feet",   abbr: "ft" },
    "'":    { factor: 1,      labelSingular: "foot",   labelPlural: "feet",   abbr: "ft" },

    yd:     { factor: 3,      labelSingular: "yard",   labelPlural: "yards",  abbr: "yd" },
    yds:    { factor: 3,      labelSingular: "yard",   labelPlural: "yards",  abbr: "yd" },
    yard:   { factor: 3,      labelSingular: "yard",   labelPlural: "yards",  abbr: "yd" },
    yards:  { factor: 3,      labelSingular: "yard",   labelPlural: "yards",  abbr: "yd" },

    mi:     { factor: 5280,   labelSingular: "mile",   labelPlural: "miles",  abbr: "mi" },
    mile:   { factor: 5280,   labelSingular: "mile",   labelPlural: "miles",  abbr: "mi" },
    miles:  { factor: 5280,   labelSingular: "mile",   labelPlural: "miles",  abbr: "mi" },
};

// ─── 2. Reference Catalog of Absurd Non-Metric Standards (100 Each) ──────────
// Each weight entry is defined in POUNDS (lbs).
export const WEIGHT_COMPARISONS = [
    { singular: "snowflake",                          plural: "snowflakes",                          lbs: 0.000007, quip: "Better hope the server room AC stays cranked down." },
    { singular: "housefly",                           plural: "houseflies",                          lbs: 0.00003,  quip: "Every single one of them rubbing its little front legs together menacingly." },
    { singular: "worker honeybee",                    plural: "worker honeybees",                    lbs: 0.00025,  quip: "According to all known laws of aviation, they shouldn't even be able to lift this." },
    { singular: "standard paperclip",                 plural: "standard paperclips",                 lbs: 0.0022,   quip: "Bent into unrecognizable shapes during a long phone call." },
    { singular: "2x4 LEGO brick",                     plural: "2x4 LEGO bricks",                     lbs: 0.0055,   quip: "Scattered across the carpet in the dark for maximum barefoot lethality." },
    { singular: "US penny",                           plural: "US pennies",                          lbs: 0.0055,   quip: "Still sitting at the bottom of a cupholder since the Carter administration." },
    { singular: "ping-pong ball",                     plural: "ping-pong balls",                     lbs: 0.006,    quip: "Garage-table tournament certified." },
    { singular: "ruby-throated hummingbird",          plural: "ruby-throated hummingbirds",          lbs: 0.007,    quip: "Powered by pure sugar water and 1,200 heartbeats per minute." },
    { singular: "wooden #2 pencil",                   plural: "wooden #2 pencils",                   lbs: 0.013,    quip: "Tooth marks along the yellow paint included." },
    { singular: "US quarter coin",                    plural: "US quarter coins",                    lbs: 0.0125,   quip: "Enough loose change to jam every arcade cabinet in District 01." },
    { singular: "Heinz tomato ketchup packet",        plural: "Heinz tomato ketchup packets",        lbs: 0.015,    quip: "Hoarded in the glovebox for a rainy day." },
    { singular: "compact cassette tape",              plural: "compact cassette tapes",              lbs: 0.04,     quip: "Keep a Bic pen handy in case the magnetic ribbon unspools." },
    { singular: "5.25-inch floppy diskette",          plural: "5.25-inch floppy diskettes",          lbs: 0.045,    quip: "Write-protect notch covered in silver tape." },
    { singular: "AA alkaline battery",                plural: "AA alkaline batteries",               lbs: 0.05,     quip: "Still not enough juice to keep a Walkman running all weekend." },
    { singular: "house mouse",                        plural: "house mice",                          lbs: 0.05,     quip: "Currently chewing through the coaxial cable behind your desk." },
    { singular: "Bic disposable lighter",             plural: "Bic disposable lighters",             lbs: 0.048,    quip: "Hold it up at the end of a Lynyrd Skynyrd encore." },
    { singular: "Hot Wheels die-cast car",            plural: "Hot Wheels die-cast cars",            lbs: 0.08,     quip: "Orange plastic loop-de-loop track sold separately." },
    { singular: "9-volt transistor battery",          plural: "9-volt transistor batteries",         lbs: 0.1,      quip: "Resist the urge to test all of them on your tongue at once." },
    { singular: "regulation golf ball",               plural: "regulation golf balls",               lbs: 0.101,    quip: "Immediately sliced straight into the nearest water hazard." },
    { singular: "Krispy Kreme glazed donut",          plural: "Krispy Kreme glazed donuts",          lbs: 0.11,     quip: "Standard police and sysadmin breakfast calibration unit." },
    { singular: "large grade-A chicken egg",          plural: "large grade-A chicken eggs",          lbs: 0.125,    quip: "Handle with extreme caution on bumpy roads." },
    { singular: "tennis ball",                        plural: "tennis balls",                        lbs: 0.128,    quip: "Freshly popped out of the pressurized metal can." },
    { singular: "deck of Bicycle playing cards",      plural: "decks of Bicycle playing cards",      lbs: 0.21,     quip: "Jokers and rules insert still inside the box." },
    { singular: "Eastern chipmunk",                   plural: "Eastern chipmunks",                   lbs: 0.22,     quip: "Cheeks currently at 110% acorn capacity." },
    { singular: "stick of salted butter",             plural: "sticks of salted butter",             lbs: 0.25,     quip: "Southern culinary baseline approved." },
    { singular: "Quarter Pounder patty",              plural: "Quarter Pounder patties",             lbs: 0.25,     quip: "Measured pre-cooked, of course." },
    { singular: "Syrian hamster",                     plural: "Syrian hamsters",                     lbs: 0.28,     quip: "Imagine the wheel torque if you harnessed them all in parallel." },
    { singular: "MLB regulation baseball",            plural: "MLB regulation baseballs",            lbs: 0.32,     quip: "108 double stitches of cowhide perfection." },
    { singular: "cue ball",                           plural: "cue balls",                           lbs: 0.375,    quip: "Rack 'em up in a smoky pool hall." },
    { singular: "Atari 2600 ROM cartridge",           plural: "Atari 2600 ROM cartridges",           lbs: 0.38,     quip: "Blow into the connector contacts just to be safe." },
    { singular: "Russet baking potato",               plural: "Russet baking potatoes",              lbs: 0.4,      quip: "Boil 'em, mash 'em, stick 'em in a stew." },
    { singular: "magic 8-ball",                       plural: "magic 8-balls",                       lbs: 0.42,     quip: "Signs point to yes." },
    { singular: "12-inch vinyl LP record",            plural: "12-inch vinyl LP records",            lbs: 0.45,     quip: "33 and a third RPM of pure analog warmth." },
    { singular: "tallboy can of cheap lager",         plural: "tallboy cans of cheap lager",         lbs: 0.55,     quip: "Crushed against a forehead at a tailgate." },
    { singular: "can of Campbell's condensed soup",   plural: "cans of Campbell's condensed soup",   lbs: 0.66,     quip: "Andy Warhol would be proud." },
    { singular: "Rubik's Cube",                       plural: "Rubik's Cubes",                       lbs: 0.68,     quip: "Peeling the stickers off still counts as solving it." },
    { singular: "box of Kraft Macaroni & Cheese",     plural: "boxes of Kraft Macaroni & Cheese",    lbs: 0.75,     quip: "Neon orange powdered cheese packet included." },
    { singular: "8-track stereo tape cartridge",      plural: "8-track stereo tape cartridges",      lbs: 0.8,      quip: "Guaranteed to switch programs right in the middle of the guitar solo." },
    { singular: "city pigeon",                        plural: "city pigeons",                        lbs: 0.85,     quip: "Zero fear of traffic, 100% commitment to stealing your bagel." },
    { singular: "NFL regulation football",            plural: "NFL regulation footballs",            lbs: 0.9,      quip: "Laces out." },
    { singular: "VHS cassette of Alien",              plural: "VHS cassettes of Alien",              lbs: 0.95,     quip: "Battling xenomorphs and remembering to be kind and rewind, Sigourney can do it all." },
    { singular: "crowbar",                            plural: "crowbars",                            lbs: 1.1,      quip: "Standard issue for theoretical physicists since the [REDACTED] incident." },
    { singular: "loaf of Wonder Bread",               plural: "loaves of Wonder Bread",              lbs: 1.25,     quip: "Pre-sliced for maximum sandwich assembly speed." },
    { singular: "Eastern gray squirrel",              plural: "Eastern gray squirrels",              lbs: 1.3,      quip: "Outsmarting birdfeeders with engineering degrees since day one." },
    { singular: "NBA regulation basketball",          plural: "NBA regulation basketballs",          lbs: 1.37,     quip: "Inflated to 8 PSI and ready for the blacktop." },
    { singular: "Sony Walkman TPS-L2 with headphones",plural: "Sony Walkman TPS-L2s",                lbs: 1.5,      quip: "Orange foam earpads intact." },
    { singular: "guinea pig",                         plural: "guinea pigs",                         lbs: 2.0,      quip: "Wheeking loudly every time the refrigerator door opens." },
    { singular: "pineapple",                          plural: "pineapples",                          lbs: 2.2,      quip: "Spiky armor plating included." },
    { singular: "rotisserie chicken",                 plural: "rotisserie chickens",                 lbs: 2.5,      quip: "Still warm under the grocery store heat lamp." },
    { singular: "human brain",                        plural: "human brains",                        lbs: 3.0,      quip: "Mostly water, fat, and 80s commercial jingles." },
    { singular: "mallard duck",                       plural: "mallard ducks",                       lbs: 3.2,      quip: "Waterproof feathers and an attitude problem." },
    { singular: "two-liter bottle of Mountain Dew",   plural: "two-liter bottles of Mountain Dew",   lbs: 4.4,      quip: "Essential fuel for late-night dungeon crawls and code compilation." },
    { singular: "standard red clay brick",            plural: "standard red clay bricks",            lbs: 4.5,      quip: "Subtle as a brick through a Serenity surveillance terminal." },
    { singular: "Chihuahua",                          plural: "Chihuahuas",                          lbs: 5.0,      quip: "50% tremble, 50% concentrated fury." },
    { singular: "5-pound bag of Domino sugar",        plural: "5-pound bags of Domino sugar",        lbs: 5.0,      quip: "Leaking a fine white trail from the bottom corner seam." },
    { singular: "Serenity SI-8100 mechanical keyboard", plural: "Serenity SI-8100 mechanical keyboards", lbs: 5.5,  quip: "Solenoid keyswitches loud enough to wake the neighbors — eat your heart out, IBM." },
    { singular: "rotary desk telephone",              plural: "rotary desk telephones",              lbs: 6.2,      quip: "Built by Bell System to survive a direct orbital strike." },
    { singular: "Fender Stratocaster electric guitar",plural: "Fender Stratocaster guitars",         lbs: 8.0,      quip: "Alder body, maple neck, whammy bar ready." },
    { singular: "12-inch cast-iron skillet",          plural: "12-inch cast-iron skillets",          lbs: 8.0,      quip: "Touch it with dish soap and you answer to grandma." },
    { singular: "gallon jug of whole milk",           plural: "gallon jugs of whole milk",           lbs: 8.6,      quip: "Do not drop on your toe in the server room." },
    { singular: "bald eagle",                         plural: "bald eagles",                         lbs: 10.0,     quip: "Cue the dubbed red-tailed hawk screech." },
    { singular: "indoor house cat",                   plural: "indoor house cats",                   lbs: 11.0,     quip: "Unless it is currently refusing to get into the vet carrier, in which case it weighs 400 pounds." },
    { singular: "Virginia opossum",                   plural: "Virginia opossums",                   lbs: 12.0,     quip: "Immune to rabies and screaming politely at the moon." },
    { singular: "ten-pin bowling ball",               plural: "ten-pin bowling balls",               lbs: 15.0,     quip: "Swirly neon reactive resin straight from the pro shop." },
    { singular: "well-fed trash panda",               plural: "well-fed trash pandas",               lbs: 18.0,     quip: "Each one currently plotting a heist on your garbage cans." },
    { singular: "Thanksgiving turkey",                plural: "Thanksgiving turkeys",                lbs: 20.0,     quip: "Giblet bag still frozen solid inside the cavity." },
    { singular: "seedless watermelon",                plural: "seedless watermelons",                lbs: 22.0,     quip: "Slapped twice in the produce aisle for acoustic verification." },
    { singular: "car tire",                           plural: "car tires",                           lbs: 25.0,     quip: "Whitewall radial, rim not included." },
    { singular: "Pembroke Welsh Corgi",               plural: "Pembroke Welsh Corgis",               lbs: 27.0,     quip: "Low center of gravity, maximum loaf density." },
    { singular: "concrete cinder block",              plural: "concrete cinder blocks",              lbs: 38.0,     quip: "Four of these and a sheet of plywood makes a college entertainment center." },
    { singular: "5-gallon water cooler jug",          plural: "5-gallon water cooler jugs",          lbs: 42.0,     quip: "Flipping it onto the dispenser without spilling a drop is an extreme sport." },
    { singular: "Serenity SI-8100 CRT + Chassis",     plural: "Serenity SI-8100 CRTs + Chassis",     lbs: 46.0,     quip: "Cold-rolled steel and P39 phosphor that left IBM in the dust." },
    { singular: "Commodore PET 2001 all-in-one",      plural: "Commodore PET 2001s",                 lbs: 44.0,     quip: "Trapezoidal sheet-metal perfection." },
    { singular: "countertop microwave oven",          plural: "countertop microwave ovens",          lbs: 55.0,     quip: "Faux woodgrain paneling and a mechanical bell timer." },
    { singular: "Golden Retriever",                   plural: "Golden Retrievers",                   lbs: 68.0,     quip: "Every single one of them convinced it is still a lapdog." },
    { singular: "emperor penguin",                    plural: "emperor penguins",                    lbs: 75.0,     quip: "Dressed for a formal gala at all times." },
    { singular: "bag of Portland cement",             plural: "bags of Portland cement",             lbs: 94.0,     quip: "Guaranteed to tear open right as you lift it out of the truck bed." },
    { singular: "capybara",                           plural: "capybaras",                           lbs: 115.0,    quip: "Zen master of the animal kingdom." },
    { singular: "ostrich",                            plural: "ostriches",                           lbs: 230.0,    quip: "A dinosaur that forgot to go extinct." },
    { singular: "keg of cheap domestic beer",         plural: "kegs of cheap domestic beer",         lbs: 160.0,    quip: "Lift with your legs, not with your spine." },
    { singular: "white-tailed deer",                  plural: "white-tailed deer",                   lbs: 175.0,    quip: "Staring directly into your high beams from the shoulder of the highway." },
    { singular: "adult giant panda",                  plural: "adult giant pandas",                  lbs: 240.0,    quip: "Fueled exclusively by bamboo and zero survival instincts." },
    { singular: "Pac-Man upright arcade cabinet",     plural: "Pac-Man upright arcade cabinets",     lbs: 275.0,    quip: "Quarter resting on the bezel calls next game." },
    { singular: "NFL offensive lineman",              plural: "NFL offensive linemen",               lbs: 315.0,    quip: "Powered by biscuits, gravy, and pure stopping power." },
    { singular: "silverback mountain gorilla",        plural: "silverback mountain gorillas",        lbs: 400.0,    quip: "Do not challenge to an arm-wrestling match." },
    { singular: "Galapagos giant tortoise",           plural: "Galapagos giant tortoises",           lbs: 475.0,    quip: "Unhurried, unbothered, and older than your great-grandfather." },
    { singular: "vending machine full of snacks",     plural: "vending machines full of snacks",     lbs: 650.0,    quip: "And the bag of chips on B4 is STILL stuck on the coil." },
    { singular: "grizzly bear",                       plural: "grizzly bears",                       lbs: 750.0,    quip: "Picnic basket security protocols recommended." },
    { singular: "Harley-Davidson Electra Glide",      plural: "Harley-Davidson Electra Glides",      lbs: 800.0,    quip: "Chrome, leather saddlebags, and 100 decibels of V-twin rumble." },
    { singular: "Steinway concert grand piano",       plural: "Steinway concert grand pianos",       lbs: 990.0,    quip: "Standard ACME falling-object cartoon ordnance." },
    { singular: "adult male polar bear",              plural: "adult male polar bears",              lbs: 1100.0,   quip: "Apex Arctic unit. Do not attempt to boop the snoot." },
    { singular: "Alaskan bull moose",                 plural: "Alaskan bull moose",                  lbs: 1400.0,   quip: "Six-foot antler rack has the right of way on every road." },
    { singular: "Holstein dairy cow",                 plural: "Holstein dairy cows",                 lbs: 1500.0,   quip: "Standing out in the pasture judging your driving." },
    { singular: "American bison",                     plural: "American bison",                      lbs: 2000.0,   quip: "Do not pet the fluffy cows." },
    { singular: "1981 DeLorean DMC-12",               plural: "1981 DeLorean DMC-12s",               lbs: 2718.0,   quip: "Brushed stainless steel gull-wings; flux capacitor sold separately." },
    { singular: "adult hippopotamus",                 plural: "adult hippopotamuses",                lbs: 3500.0,   quip: "99% muscle, 1% pure territorial rage." },
    { singular: "white rhinoceros",                   plural: "white rhinoceroses",                  lbs: 5000.0,   quip: "Basically an armored personnel carrier with a horn." },
    { singular: "African bush elephant",              plural: "African bush elephants",              lbs: 12000.0,  quip: "Nature's heavy freight division." },
    { singular: "Tyrannosaurus Rex",                  plural: "Tyrannosaurus Rexes",                 lbs: 16000.0,  quip: "Objects in mirror are closer than they appear." },
    { singular: "yellow school bus",                  plural: "yellow school buses",                 lbs: 24000.0,  quip: "Green vinyl bench seats and windows that only slide down halfway." },
    { singular: "fully loaded 18-wheeler semi truck", plural: "fully loaded 18-wheeler semi trucks", lbs: 80000.0,  quip: "Breaker 1-9, we got us a convoy." },
    { singular: "M1 Abrams main battle tank",         plural: "M1 Abrams main battle tanks",         lbs: 120000.0, quip: "Peak 'Anything But Metric' energy." },
    { singular: "Space Shuttle Orbiter",              plural: "Space Shuttle Orbiters",              lbs: 172000.0, quip: "Thermal protection tiles inspected and cleared for reentry." },
    { singular: "adult Blue Whale",                   plural: "adult Blue Whales",                   lbs: 300000.0, quip: "The undisputed heavyweight champion of Earth." }
];

// Each distance entry is defined in FEET (ft).
export const DISTANCE_COMPARISONS = [
    { singular: "thickness of a credit card",         plural: "credit card thicknesses",             ft: 0.0025,   quip: "Embossed numbers and magnetic stripe included." },
    { singular: "grain of long-grain white rice",     plural: "grains of long-grain white rice",     ft: 0.023,    quip: "Great when you are hungry and want 2,000 of something." },
    { singular: "aspirin tablet",                     plural: "aspirin tablets",                     ft: 0.033,    quip: "Take two and call the sysadmin in the morning." },
    { singular: "standard six-sided die",             plural: "standard six-sided dice",             ft: 0.052,    quip: "Roll for initiative." },
    { singular: "IBM Selectric typewriter golfball",  plural: "IBM Selectric typewriter golfballs",  ft: 0.06,     quip: "About the only thing IBM can still sell since Serenity cornered the computer market." },
    { singular: "US quarter coin",                    plural: "US quarter coins",                    ft: 0.079,    quip: "Lined up edge-to-edge along the arcade bar." },
    { singular: "tater tot",                          plural: "tater tots",                          ft: 0.1,      quip: "Keep them in your pocket for later, Napoleon." },
    { singular: "standard #1 paperclip",              plural: "standard #1 paperclips",              ft: 0.104,    quip: "It looks like you're trying to avoid the metric system. Need help?" },
    { singular: "2x4 LEGO brick",                     plural: "2x4 LEGO bricks",                     ft: 0.104,    quip: "Precision Danish injection-molded plastic." },
    { singular: "matchbook",                          plural: "matchbooks",                          ft: 0.15,     quip: "Free from a roadside bowling alley lounge." },
    { singular: "9-volt battery",                     plural: "9-volt batteries",                    ft: 0.158,    quip: "Snap terminals aligned end-to-end." },
    { singular: "AA battery",                         plural: "AA batteries",                        ft: 0.164,    quip: "Positive terminal to negative terminal." },
    { singular: "golf tee",                           plural: "golf tees",                           ft: 0.177,    quip: "Painted bright neon orange so you can still lose it in the grass." },
    { singular: "chicken nugget",                     plural: "chicken nuggets",                     ft: 0.18,     quip: "Boot, bell, ball, and bone shapes represented equally." },
    { singular: "Zippo windproof lighter",            plural: "Zippo windproof lighters",            ft: 0.187,    quip: "Cue the unmistakable metallic lid clink." },
    { singular: "Oreo cookie",                        plural: "Oreo cookies",                        ft: 0.146,    quip: "Double Stuf structural tolerance verified." },
    { singular: "Post-it Note",                       plural: "Post-it Notes",                       ft: 0.25,     quip: "Covered in forgotten passwords stuck to the CRT bezel." },
    { singular: "Taco Bell Mild sauce packet",        plural: "Taco Bell Mild sauce packets",        ft: 0.25,     quip: "Laid end-to-end across the dashboard of a '79 Trans Am." },
    { singular: "hockey puck",                        plural: "hockey pucks",                        ft: 0.25,     quip: "Vulcanized rubber, frozen solid before face-off." },
    { singular: "playing card",                       plural: "playing cards",                       ft: 0.29,     quip: "Do not breathe while stacking." },
    { singular: "8-inch magnetic floppy diskette",    plural: "8-inch magnetic floppy diskettes",    ft: 0.667,    quip: "Old-school mainframe storage; holds a whopping 250 kilobytes." },
    { singular: "stick of butter",                    plural: "sticks of butter",                    ft: 0.39,     quip: "Wax paper wrapper markings included." },
    { singular: "12-ounce soda can",                  plural: "12-ounce soda cans",                  ft: 0.402,    quip: "Pull-tab era aluminum." },
    { singular: "compact cassette case",              plural: "compact cassette cases",              ft: 0.354,    quip: "With a custom hand-written mixtape J-card inside." },
    { singular: "5.25-inch floppy diskette",          plural: "5.25-inch floppy diskettes",          ft: 0.4375,   quip: "Do not bend, staple, or expose to magnets." },
    { singular: "US one-dollar bill",                 plural: "US one-dollar bills",                 ft: 0.512,    quip: "Wrinkled enough to get rejected by the vending machine three times." },
    { singular: "TV remote control",                  plural: "TV remote controls",                  ft: 0.55,     quip: "Battery cover held on with a strip of electrical tape." },
    { singular: "standard unpeeled banana",           plural: "standard unpeeled bananas",           ft: 0.583,    quip: "The internet's universally recognized calibration rod." },
    { singular: "VHS video cassette",                 plural: "VHS video cassettes",                 ft: 0.615,    quip: "Recorded in EP mode off late-night cable." },
    { singular: "unsharpened #2 pencil",              plural: "unsharpened #2 pencils",              ft: 0.625,    quip: "Fresh pink eraser still untouched." },
    { singular: "standard house brick",               plural: "standard house bricks",               ft: 0.667,    quip: "Mortar joints not included." },
    { singular: "fork",                               plural: "dinner forks",                        ft: 0.65,     quip: "Keep away from the microwave." },
    { singular: "piece of printer paper",             plural: "pieces of tractor-feed printer paper",ft: 0.917,    quip: "Perforated tear-off sprocket strips still attached." },
    { singular: "ballpark footlong hot dog",          plural: "ballpark footlong hot dogs",          ft: 1.0,      quip: "Suspiciously close to an actual foot." },
    { singular: "12-inch vinyl record sleeve",        plural: "12-inch vinyl record sleeves",        ft: 1.03,     quip: "Gatefold edition with liner notes." },
    { singular: "bottle of hot sauce",                plural: "bottles of hot sauce",                ft: 0.7,      quip: "Aged in oak barrels on Avery Island." },
    { singular: "bowling pin",                        plural: "bowling pins",                        ft: 1.25,     quip: "Hard rock maple coated in white plastic." },
    { singular: "loaf of French bread",               plural: "loaves of French bread",              ft: 1.8,      quip: "Sticking out the top of a brown paper grocery bag." },
    { singular: "Serenity SI-8100 terminal keyboard", plural: "Serenity SI-8100 terminal keyboards", ft: 1.5,      quip: "Coiled detachable cord and dedicated function keys included." },
    { singular: "flamingos' leg",                     plural: "flamingo legs",                       ft: 1.7,      quip: "Plastic lawn ornament edition." },
    { singular: "skateboard deck",                    plural: "skateboard decks",                    ft: 2.6,      quip: "7-ply maple with fresh grip tape." },
    { singular: "baseball bat",                       plural: "Louisville Slugger baseball bats",    ft: 2.83,     quip: "Ash wood, pine tar rag on deck." },
    { singular: "yardstick",                          plural: "wooden yardsticks",                   ft: 3.0,      quip: "Free from the local hardware store paint counter." },
    { singular: "Fender Stratocaster guitar",         plural: "Fender Stratocaster guitars",         ft: 3.25,     quip: "Measured tip-to-tail in pure rock and roll." },
    { singular: "shopping cart",                      plural: "grocery store shopping carts",        ft: 3.3,      quip: "One front wheel wobbling violently at 40 Hz." },
    { singular: "fire hydrant",                       plural: "cast-iron fire hydrants",             ft: 2.5,      quip: "Freshly painted municipal yellow." },
    { singular: "emperor penguin",                    plural: "emperor penguins",                    ft: 3.75,     quip: "Standing at attention on the ice shelf." },
    { singular: "broadsheet newspaper unfolded",      plural: "unfolded Sunday newspapers",          ft: 2.4,      quip: "Crossword puzzle half-finished in pen." },
    { singular: "Danny DeVito",                       plural: "Danny DeVitos",                       ft: 4.833,    quip: "Stacked vertically, head-to-toe." },
    { singular: "broomstick",                         plural: "kitchen broomsticks",                 ft: 4.5,      quip: "Bristles slightly bent from living in the hall closet." },
    { singular: "4-drawer metal filing cabinet",      plural: "4-drawer metal filing cabinets",      ft: 4.33,     quip: "Top drawer jams unless you jiggle the lock." },
    { singular: "hockey stick",                       plural: "wooden hockey sticks",                ft: 5.2,      quip: "Blade taped up with black cloth friction tape." },
    { singular: "standard refrigerator",              plural: "standard refrigerators",              ft: 5.75,     quip: "The official unit for measuring sinkholes on local news." },
    { singular: "6-foot party sub sandwich",          plural: "6-foot party sub sandwiches",         ft: 6.0,      quip: "Toothpicks with little cellophane frills every three inches." },
    { singular: "red British telephone box",          plural: "red British telephone boxes",         ft: 8.2,      quip: "Not bigger on the inside, unfortunately." },
    { singular: "interior doorway",                   plural: "standard doorway frames",             ft: 6.67,     quip: "Duck if you're wearing a tall hat." },
    { singular: "sheet of 4x8 plywood",               plural: "sheets of 4x8 plywood",               ft: 8.0,      quip: "Strapped to the roof of a station wagon with bungee cords." },
    { singular: "ping-pong table",                    plural: "regulation ping-pong tables",         ft: 9.0,      quip: "Folds in half for garage storage." },
    { singular: "grizzly bear standing upright",      plural: "upright grizzly bears",               ft: 8.5,      quip: "Reach for the bear spray." },
    { singular: "basketball hoop height",             plural: "regulation basketball hoop heights",  ft: 10.0,     quip: "Chain net rattling in the driveway." },
    { singular: "diving board height",                plural: "high-dive platforms",                 ft: 10.0,     quip: "Look down from the edge and suddenly it feels like 100 feet." },
    { singular: "alligator",                          plural: "American alligators",                 ft: 11.5,     quip: "Currently sunbathing on the 9th fairway in Florida." },
    { singular: "Volkswagen Beetle",                  plural: "classic Volkswagen Beetles",          ft: 13.4,     quip: "Air-cooled flat-four chugging along in the right lane." },
    { singular: "1973 Ford Pinto",                    plural: "1973 Ford Pintos",                    ft: 13.5,     quip: "Keep a safe following distance from the rear bumper." },
    { singular: "1981 DeLorean DMC-12",               plural: "1981 DeLorean DMC-12s",               ft: 13.8,     quip: "Needs 88 miles per hour of runway." },
    { singular: "canoe",                              plural: "aluminum canoes",                     ft: 16.0,     quip: "Paddles clanking against the gunwales." },
    { singular: "great white shark",                  plural: "great white sharks",                  ft: 15.5,     quip: "You're gonna need a bigger boat." },
    { singular: "adult giraffe",                      plural: "adult giraffes",                      ft: 17.5,     quip: "70% neck, 30% spots." },
    { singular: "1976 Cadillac Fleetwood Eldorado",   plural: "1976 Cadillac Eldorados",             ft: 18.7,     quip: "Parallel parking requires a tugboat captain's license." },
    { singular: "giant anaconda",                     plural: "giant green anacondas",               ft: 20.0,     quip: "One very long danger noodle." },
    { singular: "two-story suburban house",           plural: "two-story suburban houses",           ft: 22.0,     quip: "Aluminum siding and a TV antenna on the chimney." },
    { singular: "Airstream travel trailer",           plural: "silver Airstream trailers",           ft: 25.0,     quip: "Polished aluminum toaster on wheels." },
    { singular: "London double-decker Routemaster",   plural: "London double-decker Routemasters",   ft: 27.5,     quip: "Mind the gap." },
    { singular: "giant squid",                        plural: "giant squids",                        ft: 33.0,     quip: "Tentacles fully extended from the abyssal trench." },
    { singular: "yellow school bus",                  plural: "yellow school buses",                 ft: 35.0,     quip: "Stop-arm extended and red lights flashing." },
    { singular: "wooden utility telephone pole",      plural: "wooden utility telephone poles",      ft: 40.0,     quip: "Stapled with 400 faded garage-sale flyers." },
    { singular: "Tyrannosaurus Rex",                  plural: "Tyrannosaurus Rexes",                 ft: 42.0,     quip: "Measured nose-to-tail; tiny arms not included." },
    { singular: "Hollywood Sign letter",              plural: "Hollywood Sign letters",              ft: 45.0,     quip: "Each letter towering over Mount Lee." },
    { singular: "45-foot semi-truck trailer",         plural: "45-foot semi-truck trailers",         ft: 45.0,     quip: "Backed up to the loading dock on the first try." },
    { singular: "regulation bowling lane",            plural: "regulation bowling lanes",            ft: 60.0,     quip: "Freshly oiled and ready for a 7-10 split." },
    { singular: "pitcher's mound to home plate",      plural: "MLB baseball pitches",                ft: 60.5,     quip: "High and inside." },
    { singular: "humpback whale",                     plural: "humpback whales",                     ft: 52.0,     quip: "Save the whales, collect the whole set." },
    { singular: "Goodyear Blimp",                     plural: "Goodyear Blimps",                     ft: 192.0,    quip: "Cruising overhead at 35 miles per hour during the Sunday game." },
    { singular: "Wright brothers' first flight",      plural: "Kitty Hawk first flights",            ft: 120.0,    quip: "Twelve seconds off the sand dunes." },
    { singular: "8-story brutalist office building",  plural: "8-story brutalist buildings",         ft: 90.0,     quip: "Serenity Industries regional bureaucracy annex." },
    { singular: "Blue Whale",                         plural: "Blue Whales",                         ft: 98.0,     quip: "Nose to tail fluke." },
    { singular: "Brachiosaurus",                      plural: "Brachiosauruses",                     ft: 85.0,     quip: "Do not feed from the treetops." },
    { singular: "Olympic swimming pool",              plural: "Olympic swimming pools",              ft: 164.0,    quip: "No running on the pool deck." },
    { singular: "Leaning Tower of Pisa",              plural: "Leaning Towers of Pisa",              ft: 186.0,    quip: "Foundation inspection overdue since 1178." },
    { singular: "Boeing 747 wingspan",                plural: "Boeing 747 wingspans",                ft: 211.0,    quip: "Queen of the skies." },
    { singular: "city block",                         plural: "standard Manhattan city blocks",      ft: 264.0,    quip: "Walk fast and don't make eye contact." },
    { singular: "Statue of Liberty",                  plural: "Statues of Liberty",                  ft: 305.0,    quip: "Measured ground-to-torch, copper patina included." },
    { singular: "Big Ben clock tower",                plural: "Big Ben clock towers",                ft: 316.0,    quip: "Bongs every hour on the hour." },
    { singular: "American football field",            plural: "American football fields",            ft: 360.0,    quip: "Endzones included — no American documentary is complete without this unit." },
    { singular: "Saturn V moon rocket",               plural: "Saturn V moon rockets",               ft: 363.0,    quip: "7.5 million pounds of thrust on the pad." },
    { singular: "Great Pyramid of Giza",              plural: "Great Pyramids of Giza",              ft: 455.0,    quip: "Limestone blocks stacked by hand." },
    { singular: "Washington Monument",                plural: "Washington Monuments",                ft: 555.0,    quip: "World's tallest stone obelisk." },
    { singular: "Seattle Space Needle",               plural: "Seattle Space Needles",               ft: 605.0,    quip: "Revolving restaurant at the top." },
    { singular: "Gateway Arch in St. Louis",          plural: "St. Louis Gateway Arches",            ft: 630.0,    quip: "As wide at the base as it is tall." },
    { singular: "Hoover Dam height",                  plural: "Hoover Dams",                         ft: 726.0,    quip: "Holding back Lake Mead." },
    { singular: "Eiffel Tower",                       plural: "Eiffel Towers",                       ft: 1083.0,   quip: "Puddle-iron latticework." },
    { singular: "USS Enterprise aircraft carrier",    plural: "USS Enterprise aircraft carriers",    ft: 1123.0,   quip: "Eight nuclear reactors and a floating runway." },
    { singular: "Empire State Building",              plural: "Empire State Buildings",              ft: 1454.0,   quip: "Lightning rod included, giant ape optional." },
    { singular: "Sears Tower",                        plural: "Sears Towers",                        ft: 1729.0,   quip: "Yes, we are still calling it the Sears Tower." },
    { singular: "Golden Gate Bridge span",            plural: "Golden Gate Bridges",                 ft: 8981.0,   quip: "Painted in International Orange through the fog." },
    { singular: "Mount Everest height",               plural: "Mount Everests",                      ft: 29032.0,  quip: "Supplemental oxygen bottled and ready." }
];

// Ring buffer of recently used comparison singular keys so back-to-back runs stay fresh
const recentComparisons = [];
const MAX_RECENT_MEMORY = 20;

// ─── 3. Formatting & Selection Helpers ───────────────────────────────────────

/**
 * Rounds a calculated ratio to whole or half-unit steps:
 * - >= 10:   snaps to the nearest whole integer with commas (e.g. "15", "1,840")
 * - >= 0.75: snaps to the nearest 0.5 increment (e.g. 1.96 -> "2", 2.4 -> "2.5")
 * - < 0.75:  snaps to "0.5" (unless tiny)
 */
function formatRatio(val) {
    if (val >= 10) {
        return Math.round(val).toLocaleString("en-US");
    }
    if (val >= 0.75) {
        const snapped = Math.round(val * 2) / 2;
        return snapped.toLocaleString("en-US");
    }
    return "0.5";
}

/**
 * Picks a fun comparison item from the pool whose ratio falls in a comedic
 * "sweet spot" (ideally between 1.25x and 2,500x of the reference object),
 * while avoiding recently displayed items to maximize variety across uses.
 */
function pickComparison(baseValue, pool, unitKey) {
    const chooseWithAntiRepeat = (candidates) => {
        const fresh = candidates.filter((c) => !recentComparisons.includes(c.singular));
        const activePool = fresh.length > 0 ? fresh : candidates;
        const chosen = activePool[Math.floor(Math.random() * activePool.length)];
        recentComparisons.push(chosen.singular);
        if (recentComparisons.length > MAX_RECENT_MEMORY) {
            recentComparisons.shift();
        }
        return chosen;
    };

    // Score each candidate by whether it lands in a fun, easy-to-picture range
    const sweetSpot = pool.filter((item) => {
        const ratio = baseValue / item[unitKey];
        return ratio >= 1.25 && ratio <= 2500;
    });

    if (sweetSpot.length > 0) {
        return chooseWithAntiRepeat(sweetSpot);
    }

    // Fallback: wider range (0.5x to 25,000x)
    const wideSpot = pool.filter((item) => {
        const ratio = baseValue / item[unitKey];
        return ratio >= 0.5 && ratio <= 25000;
    });

    if (wideSpot.length > 0) {
        return chooseWithAntiRepeat(wideSpot);
    }

    // Extreme fallback: pick smallest item if tiny, or largest item if massive
    return baseValue < pool[0][unitKey] ? pool[0] : pool[pool.length - 1];
}

/**
 * Parses a raw user measurement string (e.g. "230 lbs", "150ft", "1,200", "12.5 oz").
 * If the user only enters a number, defaults to 'lbs' (Weight) or 'ft' (Distance).
 */
function parseMeasurementInput(rawStr, mode) {
    if (!rawStr) return null;
    const cleaned = rawStr.trim().replace(/,/g, "");
    const match = cleaned.match(/^([+-]?\d+(?:\.\d+)?|\.\d+)\s*([a-zA-Z"']*)$/);
    if (!match) return null;

    const numVal = parseFloat(match[1]);
    if (isNaN(numVal) || numVal <= 0) return { error: "Measurement must be a positive number greater than zero." };

    const rawUnit = (match[2] || "").toLowerCase().trim();
    const unitTable = mode === "W" ? WEIGHT_UNITS : DISTANCE_UNITS;
    const defaultUnitKey = mode === "W" ? "lbs" : "ft";

    const unitKey = rawUnit || defaultUnitKey;
    const unitInfo = unitTable[unitKey];

    if (!unitInfo) {
        const validList = mode === "W" ? "[oz], [lbs], or [tons]" : "[in], [ft], [yd], or [mi]";
        return { error: `Unrecognized unit '${rawUnit}'. Please use ${validList}.` };
    }

    const baseValue = numVal * unitInfo.factor;
    const unitLabel = numVal === 1 ? unitInfo.labelSingular : unitInfo.labelPlural;

    return {
        numVal,
        unitInfo,
        unitLabel,
        baseValue
    };
}

/**
 * Renders the conversion result block to the terminal using varied phrasing.
 */
async function printConversionResult(ctx, mode, parsed) {
    const { numVal, unitLabel, baseValue } = parsed;
    const inputDisplay = `${numVal.toLocaleString("en-US")} ${unitLabel}`;

    if (mode === "W") {
        const ref = pickComparison(baseValue, WEIGHT_COMPARISONS, "lbs");
        const count = baseValue / ref.lbs;
        const countStr = formatRatio(count);
        const itemName = (countStr === "1" ? ref.singular : ref.plural).trim();

        const weightTemplates = [
            `  Something weighing ${inputDisplay} would weigh about as much as\n  ${countStr} ${itemName}!`,
            `  ${inputDisplay} tips the scales at roughly ${countStr} ${itemName}!`,
            `  You'd need about ${countStr} ${itemName} to match the weight\n  of ${inputDisplay}!`,
            `  In official non-metric terms, ${inputDisplay} comes out to right\n  around ${countStr} ${itemName}.`,
            `  Hauling ${inputDisplay} is equivalent to lugging around\n  ${countStr} ${itemName}!`
        ];
        const chosenLine = weightTemplates[Math.floor(Math.random() * weightTemplates.length)];

        ctx.print("");
        await ctx.type(`[TELEMETRY] Computing non-metric mass equivalency...`, { speed: 6, pager: false });
        await sleep(150);
        ctx.print(`──────────────────────────────────────────────────────────────────────`);
        await ctx.type(chosenLine, { speed: 10, pager: false });
        ctx.print(`  ${ref.quip}`);
        ctx.print(`──────────────────────────────────────────────────────────────────────\n`);
    } else {
        const ref = pickComparison(baseValue, DISTANCE_COMPARISONS, "ft");
        const count = baseValue / ref.ft;
        const countStr = formatRatio(count);
        const itemName = (countStr === "1" ? ref.singular : ref.plural).trim();

        const distanceTemplates = [
            `  A distance of ${inputDisplay} is about as long as ${countStr}\n  ${itemName} laid end-to-end!`,
            `  Something measuring ${inputDisplay} would span roughly\n  ${countStr} ${itemName}!`,
            `  To stretch across ${inputDisplay}, you'd have to line up\n  about ${countStr} ${itemName}!`,
            `  In standard non-metric units, ${inputDisplay} comes out to\n  ${countStr} ${itemName} stacked tip-to-tail.`,
            `  Picture ${countStr} ${itemName} in a single row —\n  that's ${inputDisplay}!`
        ];
        const chosenLine = distanceTemplates[Math.floor(Math.random() * distanceTemplates.length)];

        ctx.print("");
        await ctx.type(`[TELEMETRY] Computing non-metric linear span...`, { speed: 6, pager: false });
        await sleep(150);
        ctx.print(`──────────────────────────────────────────────────────────────────────`);
        await ctx.type(chosenLine, { speed: 10, pager: false });
        ctx.print(`  ${ref.quip}`);
        ctx.print(`──────────────────────────────────────────────────────────────────────\n`);
    }
}

// ─── 4. Main Interactive CLI Loop ────────────────────────────────────────────

export async function launchABM(args = [], ctx) {
    // Fast-path: if the user passed inline arguments like `abm 230 lbs` or `abm 150 ft`
    if (args && args.length > 0) {
        const inlineRaw = args.join(" ");
        const tryWeight = parseMeasurementInput(inlineRaw, "W");
        const tryDist = parseMeasurementInput(inlineRaw, "D");

        // Check if an explicit unit matched either weight or distance
        const hasWeightUnit = args.some(a => WEIGHT_UNITS[a.toLowerCase()]);
        const hasDistUnit = args.some(a => DISTANCE_UNITS[a.toLowerCase()]);

        if (hasWeightUnit && tryWeight && !tryWeight.error) {
            await printConversionResult(ctx, "W", tryWeight);
            return;
        }
        if (hasDistUnit && tryDist && !tryDist.error) {
            await printConversionResult(ctx, "D", tryDist);
            return;
        }
    }

    if (typeof ctx.readInput !== "function") {
        ctx.error("Interactive mode is not supported in this shell context.");
        return;
    }

    ctx.print("======================================================================");
    ctx.print("  ANYTHING BUT METRIC (A.B.M.) // IMPERIAL EQUIVALENCY ENGINE v1.04   ");
    ctx.print("  \"BECAUSE TEN IS AN ARBITRARY NUMBER.\"                               ");
    ctx.print("======================================================================\n");

    let keepRunning = true;

    while (keepRunning) {
        // Step 1: Ask [W]eight or [D]istance
        let mode = null;
        while (!mode) {
            ctx.print("Are you measuring [W]eight or [D]istance? (or [Q]uit)");
            const modeAns = (await ctx.readInput("> ", { snap: false })).trim().toLowerCase();

            if (!modeAns || modeAns === "q" || modeAns === "quit" || modeAns === "exit") {
                ctx.print("[A.B.M.] Exiting Imperial Equivalency Engine. Stay un-metric.\n");
                return;
            }

            if (modeAns === "w" || modeAns === "weight") {
                mode = "W";
            } else if (modeAns === "d" || modeAns === "distance" || modeAns === "dist") {
                mode = "D";
            } else {
                ctx.error("Please enter [W] for Weight, [D] for Distance, or [Q] to Quit.");
            }
        }

        // Step 2: Ask for the measurement value & unit
        let parsed = null;
        while (!parsed) {
            if (mode === "W") {
                ctx.print("How heavy in [oz], [lbs], or [tons]? (e.g. 230 lbs)");
            } else {
                ctx.print("How far in [in], [ft], [yd], or [mi]? (e.g. 150 ft)");
            }

            const rawVal = (await ctx.readInput("> ", { snap: false })).trim();
            if (!rawVal || /^(q|quit|exit)$/i.test(rawVal)) {
                ctx.print("[A.B.M.] Exiting Imperial Equivalency Engine. Stay un-metric.\n");
                return;
            }

            const attempt = parseMeasurementInput(rawVal, mode);
            if (!attempt) {
                const example = mode === "W" ? "230 lbs" : "150 ft";
                ctx.error(`Invalid input. Enter a number and unit, like '${example}'.`);
            } else if (attempt.error) {
                ctx.error(attempt.error);
            } else {
                parsed = attempt;
            }
        }

        // Step 3: Compute & Print Comparison
        if (ctx.playBell) ctx.playBell(880, 0.05);
        await printConversionResult(ctx, mode, parsed);

        // Step 4: Ask if the user wants to run another conversion
        ctx.print("Convert another measurement? [Y/N]");
        const againAns = (await ctx.readInput("> ", { snap: false })).trim().toLowerCase();
        if (againAns !== "y" && againAns !== "yes") {
            keepRunning = false;
            ctx.print("[A.B.M.] Session terminated. Metric system successfully avoided.\n");
        } else {
            ctx.print("");
        }
    }
}

export default launchABM;
