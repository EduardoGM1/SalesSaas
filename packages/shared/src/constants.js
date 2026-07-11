const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];
const DAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado"
];
const WS_DEFAULTS = {
  wo1m: "60",
  wo1r: "12.99",
  wo2m: "48",
  wo2r: "8.90",
  wo3m: "12",
  wo3r: "0"
};
const WS_CONFIG_IDS = ["wo1m", "wo1r", "wo2m", "wo2r", "wo3m", "wo3r"];
const COUNTRY_CITY = {
  "México": [
    "Cancún", "Playa del Carmen", "Tulum", "Mérida", "Ciudad de México", "Guadalajara", "Monterrey",
    "Los Cabos", "Puerto Vallarta", "Querétaro", "Puebla", "León", "Tijuana", "Toluca",
    "San Miguel de Allende", "Oaxaca", "Mazatlán", "Acapulco", "Veracruz", "Otro",
  ],
  "Estados Unidos": [
    "Miami", "New York", "Los Angeles", "Chicago", "Houston", "Dallas", "Las Vegas", "San Diego",
    "Phoenix", "Orlando", "Atlanta", "Boston", "San Francisco", "Seattle", "Denver", "Austin",
    "Tampa", "Fort Lauderdale", "Washington D.C.", "Philadelphia", "Otro",
  ],
  "Canadá": [
    "Montreal", "Toronto", "Vancouver", "Calgary", "Ottawa", "Quebec City", "Edmonton", "Winnipeg",
    "Victoria", "Halifax", "Otro",
  ],
  "Colombia": [
    "Bogotá", "Medellín", "Cali", "Cartagena", "Barranquilla", "Bucaramanga", "Pereira", "Santa Marta",
    "Manizales", "Cúcuta", "Otro",
  ],
  "Brasil": [
    "São Paulo", "Rio de Janeiro", "Brasília", "Belo Horizonte", "Curitiba", "Salvador", "Fortaleza",
    "Recife", "Porto Alegre", "Florianópolis", "Otro",
  ],
  "Argentina": [
    "Buenos Aires", "Córdoba", "Rosario", "Mendoza", "Bariloche", "Mar del Plata", "Salta", "Ushuaia", "Otro",
  ],
  "Chile": [
    "Santiago", "Valparaíso", "Concepción", "Viña del Mar", "La Serena", "Antofagasta", "Punta Arenas", "Otro",
  ],
  "Perú": [
    "Lima", "Cusco", "Arequipa", "Trujillo", "Piura", "Iquitos", "Puno", "Otro",
  ],
  "Venezuela": [
    "Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Maracay", "Puerto La Cruz", "Otro",
  ],
  "Ecuador": [
    "Quito", "Guayaquil", "Cuenca", "Manta", "Ambato", "Loja", "Otro",
  ],
  "Bolivia": [
    "La Paz", "Santa Cruz", "Cochabamba", "Sucre", "Oruro", "Otro",
  ],
  "Paraguay": [
    "Asunción", "Ciudad del Este", "Encarnación", "San Lorenzo", "Otro",
  ],
  "Uruguay": [
    "Montevideo", "Punta del Este", "Salto", "Colonia del Sacramento", "Otro",
  ],
  "Costa Rica": [
    "San José", "Liberia", "Alajuela", "Heredia", "Cartago", "Puntarenas", "Limón", "Otro",
  ],
  "Panamá": [
    "Ciudad de Panamá", "David", "Colón", "Santiago", "Bocas del Toro", "Otro",
  ],
  "Guatemala": [
    "Ciudad de Guatemala", "Antigua", "Quetzaltenango", "Escuintla", "Cobán", "Otro",
  ],
  "Honduras": [
    "Tegucigalpa", "San Pedro Sula", "La Ceiba", "Roatán", "Choloma", "Otro",
  ],
  "El Salvador": [
    "San Salvador", "Santa Ana", "San Miguel", "La Libertad", "Otro",
  ],
  "Nicaragua": [
    "Managua", "León", "Granada", "Masaya", "Estelí", "Otro",
  ],
  "Belice": [
    "Belize City", "San Ignacio", "San Pedro", "Belmopan", "Otro",
  ],
  "Cuba": [
    "La Habana", "Santiago de Cuba", "Varadero", "Camagüey", "Holguín", "Otro",
  ],
  "República Dominicana": [
    "Santo Domingo", "Punta Cana", "Santiago", "Puerto Plata", "La Romana", "Otro",
  ],
  "Puerto Rico": [
    "San Juan", "Ponce", "Mayagüez", "Bayamón", "Carolina", "Otro",
  ],
  "Jamaica": [
    "Kingston", "Montego Bay", "Ocho Rios", "Negril", "Otro",
  ],
  "Bahamas": [
    "Nassau", "Freeport", "Otro",
  ],
  "Trinidad y Tobago": [
    "Port of Spain", "San Fernando", "Otro",
  ],
  "Haití": [
    "Puerto Príncipe", "Cap-Haïtien", "Otro",
  ],
  "España": [
    "Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga", "Bilbao", "Alicante", "Granada", "Otro",
  ],
  "Portugal": [
    "Lisboa", "Porto", "Faro", "Braga", "Coimbra", "Otro",
  ],
  "Francia": [
    "París", "Lyon", "Marsella", "Niza", "Toulouse", "Burdeos", "Otro",
  ],
  "Italia": [
    "Roma", "Milán", "Florencia", "Venecia", "Nápoles", "Turín", "Otro",
  ],
  "Alemania": [
    "Berlín", "Múnich", "Hamburgo", "Fráncfort", "Colonia", "Stuttgart", "Otro",
  ],
  "Reino Unido": [
    "Londres", "Manchester", "Birmingham", "Edimburgo", "Liverpool", "Glasgow", "Otro",
  ],
  "Irlanda": [
    "Dublín", "Cork", "Galway", "Limerick", "Otro",
  ],
  "Países Bajos": [
    "Ámsterdam", "Róterdam", "La Haya", "Utrecht", "Otro",
  ],
  "Bélgica": [
    "Bruselas", "Amberes", "Gante", "Brujas", "Otro",
  ],
  "Suiza": [
    "Zúrich", "Ginebra", "Berna", "Basilea", "Lausana", "Otro",
  ],
  "Austria": [
    "Viena", "Salzburgo", "Innsbruck", "Graz", "Otro",
  ],
  "Suecia": [
    "Estocolmo", "Gotemburgo", "Malmö", "Otro",
  ],
  "Noruega": [
    "Oslo", "Bergen", "Trondheim", "Otro",
  ],
  "Dinamarca": [
    "Copenhague", "Aarhus", "Odense", "Otro",
  ],
  "Finlandia": [
    "Helsinki", "Tampere", "Turku", "Otro",
  ],
  "Polonia": [
    "Varsovia", "Cracovia", "Gdansk", "Wroclaw", "Otro",
  ],
  "Grecia": [
    "Atenas", "Salónica", "Heraclión", "Otro",
  ],
  "Turquía": [
    "Estambul", "Ankara", "Antalya", "Izmir", "Otro",
  ],
  "Rusia": [
    "Moscú", "San Petersburgo", "Otro",
  ],
  "Japón": [
    "Tokio", "Osaka", "Kioto", "Yokohama", "Nagoya", "Otro",
  ],
  "Corea del Sur": [
    "Seúl", "Busan", "Incheon", "Daegu", "Otro",
  ],
  "China": [
    "Pekín", "Shanghái", "Shenzhen", "Cantón", "Hong Kong", "Otro",
  ],
  "India": [
    "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Otro",
  ],
  "Tailandia": [
    "Bangkok", "Phuket", "Chiang Mai", "Pattaya", "Otro",
  ],
  "Singapur": [
    "Singapur", "Otro",
  ],
  "Malasia": [
    "Kuala Lumpur", "Penang", "Johor Bahru", "Otro",
  ],
  "Indonesia": [
    "Yakarta", "Bali", "Surabaya", "Otro",
  ],
  "Filipinas": [
    "Manila", "Cebú", "Davao", "Otro",
  ],
  "Vietnam": [
    "Hanói", "Ciudad Ho Chi Minh", "Da Nang", "Otro",
  ],
  "Australia": [
    "Sídney", "Melbourne", "Brisbane", "Perth", "Adelaida", "Gold Coast", "Otro",
  ],
  "Nueva Zelanda": [
    "Auckland", "Wellington", "Christchurch", "Queenstown", "Otro",
  ],
  "Emiratos Árabes Unidos": [
    "Dubái", "Abu Dhabi", "Sharjah", "Otro",
  ],
  "Arabia Saudita": [
    "Riad", "Yeda", "Dammam", "Otro",
  ],
  "Catar": [
    "Doha", "Otro",
  ],
  "Israel": [
    "Tel Aviv", "Jerusalén", "Haifa", "Otro",
  ],
  "Egipto": [
    "El Cairo", "Alejandría", "Sharm el-Sheikh", "Luxor", "Otro",
  ],
  "Marruecos": [
    "Casablanca", "Marrakech", "Rabat", "Fez", "Tánger", "Otro",
  ],
  "Sudáfrica": [
    "Ciudad del Cabo", "Johannesburgo", "Durban", "Pretoria", "Otro",
  ],
  "Nigeria": [
    "Lagos", "Abuja", "Port Harcourt", "Otro",
  ],
  "Kenia": [
    "Nairobi", "Mombasa", "Otro",
  ],
  "Otro": ["Otro"],
};
const COUNTRY_FLAGS = {
  "México": "🇲🇽",
  "Estados Unidos": "🇺🇸",
  "Canadá": "🇨🇦",
  "Colombia": "🇨🇴",
  "Brasil": "🇧🇷",
  "Argentina": "🇦🇷",
  "Chile": "🇨🇱",
  "Perú": "🇵🇪",
  "Venezuela": "🇻🇪",
  "Ecuador": "🇪🇨",
  "Bolivia": "🇧🇴",
  "Paraguay": "🇵🇾",
  "Uruguay": "🇺🇾",
  "Costa Rica": "🇨🇷",
  "Panamá": "🇵🇦",
  "Guatemala": "🇬🇹",
  "Honduras": "🇭🇳",
  "El Salvador": "🇸🇻",
  "Nicaragua": "🇳🇮",
  "Belice": "🇧🇿",
  "Cuba": "🇨🇺",
  "República Dominicana": "🇩🇴",
  "Puerto Rico": "🇵🇷",
  "Jamaica": "🇯🇲",
  "Bahamas": "🇧🇸",
  "Trinidad y Tobago": "🇹🇹",
  "Haití": "🇭🇹",
  "España": "🇪🇸",
  "Portugal": "🇵🇹",
  "Francia": "🇫🇷",
  "Italia": "🇮🇹",
  "Alemania": "🇩🇪",
  "Reino Unido": "🇬🇧",
  "Irlanda": "🇮🇪",
  "Países Bajos": "🇳🇱",
  "Bélgica": "🇧🇪",
  "Suiza": "🇨🇭",
  "Austria": "🇦🇹",
  "Suecia": "🇸🇪",
  "Noruega": "🇳🇴",
  "Dinamarca": "🇩🇰",
  "Finlandia": "🇫🇮",
  "Polonia": "🇵🇱",
  "Grecia": "🇬🇷",
  "Turquía": "🇹🇷",
  "Rusia": "🇷🇺",
  "Japón": "🇯🇵",
  "Corea del Sur": "🇰🇷",
  "China": "🇨🇳",
  "India": "🇮🇳",
  "Tailandia": "🇹🇭",
  "Singapur": "🇸🇬",
  "Malasia": "🇲🇾",
  "Indonesia": "🇮🇩",
  "Filipinas": "🇵🇭",
  "Vietnam": "🇻🇳",
  "Australia": "🇦🇺",
  "Nueva Zelanda": "🇳🇿",
  "Emiratos Árabes Unidos": "🇦🇪",
  "Arabia Saudita": "🇸🇦",
  "Catar": "🇶🇦",
  "Israel": "🇮🇱",
  "Egipto": "🇪🇬",
  "Marruecos": "🇲🇦",
  "Sudáfrica": "🇿🇦",
  "Nigeria": "🇳🇬",
  "Kenia": "🇰🇪",
  "Otro": "🌐",
};
const CURRENCIES = ["USD", "MXN", "CAD", "EUR"];
export {
  COUNTRY_CITY,
  COUNTRY_FLAGS,
  CURRENCIES,
  DAYS,
  MONTHS,
  WS_CONFIG_IDS,
  WS_DEFAULTS
};
