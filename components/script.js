let touchStartY = 0;
let isPulling = false;
let isRefreshing = false;

let weatherCache = null;
let weatherLastFetch = 0;
let extrasCache = { extras: "", moon: "" };
let extrasLastFetch = 0;
let currentTemperatureMessage = '';

// ── Utilitários: retry e reconexão automática ──────────────────────────────

/**
 * Tenta executar fn até maxTentativas vezes, aguardando intervalo ms entre elas.
 */
function tentarComRetry(fn, maxTentativas = 3, intervalo = 4000) {
  return new Promise(async (resolve, reject) => {
    for (let i = 0; i < maxTentativas; i++) {
      try {
        const resultado = await fn();
        return resolve(resultado);
      } catch (err) {
        console.warn(`Tentativa ${i + 1}/${maxTentativas} falhou:`, err.message);
        if (i < maxTentativas - 1) {
          await new Promise(r => setTimeout(r, intervalo));
        }
      }
    }
    reject(new Error(`Falhou após ${maxTentativas} tentativas`));
  });
}

/** Tenta recarregar os dados do tempo após 5 segundos. */
function reiniciarBuscaAutomatica() {
  setTimeout(() => buscarPrevisaoPorGeolocalizacao(false), 5000);
}

document.addEventListener('touchstart', function (e) {
if (window.scrollY === 0) {
touchStartY = e.touches[0].clientY;
isPulling = true;
}
}, { passive: true });

document.addEventListener('touchmove', function (e) {
if (!isPulling || isRefreshing) return;

const touchY = e.touches[0].clientY;
const distance = touchY - touchStartY;

const refreshDiv = document.getElementById('pullToRefresh');

if (distance > 50) {
refreshDiv.style.opacity = '1';
} else {
refreshDiv.style.opacity = '0';
}
}, { passive: true });

document.addEventListener('touchend', function (e) {
if (!isPulling || isRefreshing) return;

const touchEndY = e.changedTouches[0].clientY;
const distance = touchEndY - touchStartY;
const refreshDiv = document.getElementById('pullToRefresh');

if (distance > 80) {
isRefreshing = true;
refreshDiv.style.opacity = '1';

// Aqui você chama sua função de atualização
atualizarDados().then(() => {
// Após atualizar, esconde o spinner
setTimeout(() => {
refreshDiv.style.opacity = '0';
isRefreshing = false;
}, 800);
});
} else {
refreshDiv.style.opacity = '0';
}

isPulling = false;
}, { passive: true });

function getWeatherElements() {
const ids = [
['result', 'weatherResult'],
['status', 'status'],
['splash', 'splashScreen'],
['pullRefresh', 'pullToRefresh'],
['moonInfo', 'moonInfo'],
['extras', 'extras']
];

const elements = {};

ids.forEach(([key, id]) => {
const el = document.getElementById(id);
if (!el) {
console.warn(`Elemento com ID '${id}' não encontrado.`);
}
elements[key] = el;
});

return elements;
}

// Sua função que atualiza os dados do app
async function atualizarDados() {
console.log('Atualizando dados...');
location.reload();
}

// tempo máximo que o splash pode permanecer (ms)
const SPLASH_TIMEOUT = 25000;  // 25 segundos

function abrirCameraExterna() {
    const streamUrl = 'https://5a8d73edc0407.streamlock.net:443/bnutv20/bnutv2004.stream/playlist.m3u8';
    
    // Cria modal fullscreen com player de vídeo
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #000;
        z-index: 10000;
        display: flex;
        flex-direction: column;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕ Fechar';
    closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 15px;
        background: #ff6f00;
        color: white;
        border: none;
        padding: 10px 20px;
        cursor: pointer;
        z-index: 10001;
        border-radius: 5px;
        font-weight: bold;
    `;
    
    const video = document.createElement('video');
    video.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: contain;
    `;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    
    const source = document.createElement('source');
    source.src = streamUrl;
    source.type = 'application/x-mpegURL';
    
    video.appendChild(source);
    
    closeBtn.onclick = () => document.body.removeChild(modal);
    
    modal.appendChild(closeBtn);
    modal.appendChild(video);
    document.body.appendChild(modal);
    
    // Tenta reproduzir
    video.play().catch(err => console.log('Erro ao reproduzir:', err));
}

// Função para obter o nome da localização
async function obterNomeLocalizacao(lat, lon) {
let cidade = '', bairro = '';

try {
const NOMINATIM_URL = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=pt-BR`;
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);

const resGeo = await fetch(NOMINATIM_URL, {
headers: { 'User-Agent': 'MeuClima/1.0 (local testing)' },
mode: 'cors',
cache: 'no-cache',
credentials: 'omit',
signal: controller.signal
});

clearTimeout(timeoutId);

if (!resGeo.ok) throw new Error(`HTTP ${resGeo.status}`);

const dataGeo = await resGeo.json();

bairro = dataGeo.address?.suburb ?? dataGeo.address?.neighbourhood ?? '';
cidade = dataGeo.address?.city ?? dataGeo.address?.town ?? dataGeo.address?.state ?? '';

if (!cidade) {
cidade = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
bairro = '';
console.warn('Cidade não encontrada, usando coordenadas como fallback.');
}

} catch (e) {
console.error('Erro ao obter nome da localização:', e);
bairro = '';
cidade = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

return { cidade, bairro };
}

// Função para mostrar mensagem de erro
function mostrarMensagemErro(mensagem) {
const resultDiv = document.getElementById('weatherResult');
if (resultDiv) {
resultDiv.innerHTML = `
<div style="color:#ff6f00;text-align:center;padding:20px;">
<p>${mensagem}</p>
<button onclick="reiniciarBusca()" style="
background:#ff6f00;color:white;border:none;
padding:8px 16px;border-radius:4px;margin-top:10px;">
Tentar novamente
</button>
</div>`;
}
}

// Função para abrir o site yr.no
function abrirYrNoFallback() {
const url = "https://www.yr.no/en/forecast/graph/2-3469968/Brazil/Santa%20Catarina/Blumenau/Blumenau";
window.open(url, "_blank");
}

function atualizarHTML(id, html) {
const el = document.getElementById(id);
if (el) el.innerHTML = html;
}

function temEspacoDisponivel(tamanhoNecessario) {
let tamanhoUsado = 0;
for (let i = 0; i < localStorage.length; i++) {
const chave = localStorage.key(i);
const valor = localStorage.getItem(chave);
if (valor !== null) {
tamanhoUsado += chave.length + valor.length;
}
}
return (tamanhoUsado + tamanhoNecessario) < 4.5 * 1024 * 1024;
}

function limparCachePreventivo() {
const itens = [];
for (let i = 0; i < localStorage.length; i++) {
const chave = localStorage.key(i);
if (chave.startsWith('cache_')) {
try {
const item = JSON.parse(localStorage.getItem(chave));
itens.push({
chave,
timestamp: item.timestamp,
prioridade: item.prioridade || 0
});
} catch {
localStorage.removeItem(chave);
}
}
}

itens.sort((a, b) => a.prioridade - b.prioridade || a.timestamp - b.timestamp);

const itensParaRemover = Math.ceil(itens.length * 0.2);
for (let i = 0; i < itensParaRemover; i++) {
localStorage.removeItem(itens[i].chave);
}
}

function limparCachePorPrioridade() {
const itens = [];
const prefixo = 'cache_';

for (let i = 0; i < localStorage.length; i++) {
const chave = localStorage.key(i);
if (chave.startsWith(prefixo)) {
try {
const item = JSON.parse(localStorage.getItem(chave));
itens.push({
chave,
timestamp: item.timestamp,
prioridade: item.prioridade || 0
});
} catch {
localStorage.removeItem(chave);
}
}
}

itens.sort((a, b) => a.prioridade - b.prioridade || a.timestamp - b.timestamp);

const quantidadeRemover = Math.ceil(itens.length * 0.2);
for (let i = 0; i < quantidadeRemover; i++) {
localStorage.removeItem(itens[i].chave);
}
}

function limparCacheAntigoMaisAgressivo(removerPercentual = 0.5) {
const agora = Date.now();
const prefixoCache = 'cache_';
const itensCache = [];

for (let i = 0; i < localStorage.length; i++) {
const chave = localStorage.key(i);
if (chave && chave.startsWith(prefixoCache)) {
try {
const registro = JSON.parse(localStorage.getItem(chave));
if (registro && typeof registro === 'object' && typeof registro.timestamp === 'number') {
itensCache.push({
chave,
timestamp: registro.timestamp,
expira: typeof registro.expira === 'number' ? registro.expira : 0
});
} else {
itensCache.push({ chave, invalido: true });
}
} catch {
itensCache.push({ chave, invalido: true });
}
}
}

itensCache.forEach(item => {
if (item.invalido) {
localStorage.removeItem(item.chave);
} else if (item.expira > 0 && (item.timestamp + item.expira) < agora) {
localStorage.removeItem(item.chave);
}
});

const itensValidos = itensCache.filter(item =>
!item.invalido &&
!(item.expira > 0 && (item.timestamp + item.expira) < agora)
);

if (itensValidos.length > 0) {
itensValidos.sort((a, b) => a.timestamp - b.timestamp);
const quantidadeRemover = Math.ceil(itensValidos.length * removerPercentual);

for (let i = 0; i < quantidadeRemover; i++) {
localStorage.removeItem(itensValidos[i].chave);
}
}
}

function salvarCache(chave, dados, duracaoMin = 10, prioridade = 1) {
if (typeof localStorage === 'undefined') {
console.warn('localStorage não está disponível neste ambiente');
return false;
}

const registro = {
timestamp: Date.now(),
expira: duracaoMin * 60 * 1000,
dados: dados,
prioridade: prioridade
};

const tentarSalvar = () => {
try {
const chaveCompleta = `cache_${chave}`;
const dadosSerializados = JSON.stringify(registro);

if (dadosSerializados.length > 2 * 1024 * 1024) {
console.warn('Dados muito grandes para cache', chaveCompleta);
return false;
}

localStorage.setItem(chaveCompleta, dadosSerializados);
return true;
} catch (e) {
if (e.name === 'QuotaExceededError') {
console.warn('Espaço insuficiente, acionando limpeza...');
return false;
}
console.error('Erro ao salvar no cache:', e);
return false;
}
};

if (tentarSalvar()) return true;

limparCachePorPrioridade();
if (tentarSalvar()) return true;

limparCacheAntigoMaisAgressivo(0.5);
if (tentarSalvar()) return true;

console.error('Falha ao salvar no cache após múltiplas tentativas');
return false;
}

document.addEventListener('DOMContentLoaded', () => {
limparCacheAntigoMaisAgressivo();
});

function finalizarPullToRefresh() {
isRefreshing = false;
const pullElement = document.getElementById('pullToRefresh');
if (pullElement) {
pullElement.style.transform = 'translateY(0)';
pullElement.style.transition = 'transform 0.3s ease';
}
}

function abrirMapa(){
const t = document.getElementById('telaMapa');
t.style.display = 'block';
document.body.classList.add('modal-aberto');
setTimeout(()=> t.style.opacity = '1', 10);
}

function fecharMapa(){
const t = document.getElementById('telaMapa');
t.style.display = 'none';
document.body.classList.remove('modal-aberto');
}

function verificarAlertas(weatherData) {
const notificacao = document.getElementById('notificacaoAlerta');
const current = weatherData.current;
let alertas = [];

if (current.temp_c >= 35) {
alertas.push(`🔥 Calor extremo! ${current.temp_c}°C`);
}
if (current.temp_c <= 5) {
alertas.push(`❄️ Frio intenso! ${current.temp_c}°C`);
}
if (current.precip_mm > 20) {
alertas.push(`🌧️ Chuva forte! ${current.precip_mm}mm`);
}
if (current.wind_kph > 40) {
alertas.push(`💨 Vento forte! ${current.wind_kph.toFixed(1)} km/h`);
}

if (alertas.length > 0) {
const alertaSelecionado = alertas[Math.floor(Math.random() * alertas.length)];

notificacao.textContent = alertaSelecionado;
notificacao.style.display = 'block';
setTimeout(() => {
notificacao.style.opacity = '1';
}, 10);
setTimeout(() => {
notificacao.style.opacity = '0';
setTimeout(() => {
notificacao.style.display = 'none';
}, 300);
}, 5000);
}
}

function obterFaixaTemperatura(temp) {
if (temp < 15) return "frio";
if (temp <= 22) return "fresco";
if (temp <= 30) return "agradável";
if (temp <= 39) return "calor";
return "intenso";
}

function mostrarSugestaoReceita(tempAtual) {
fetch('receitas.json')
.then(res => res.json())
.then(receitas => {
const faixa = obterFaixaTemperatura(tempAtual);

const receitasDaFaixa = receitas.filter(r =>
r.faixa && r.nome && !r._comentario && r.faixa === faixa
);

if (receitasDaFaixa.length > 0) {
const receita = receitasDaFaixa[Math.floor(Math.random() * receitasDaFaixa.length)];
const box = document.getElementById('sugestaoReceita');
box.innerHTML = `
<p style="margin-bottom: 0.6em; font-size: 0.75em; margin-top: 6px;">
Hoje pede: ${receita.emoji} 
<strong>${receita.nome}</strong>
</p>
<p style="margin-top: 0.4em; font-size: 0.75em; line-height: 1.2em;">${receita.descricao}</p>
`;
box.style.display = 'block';
} else {
console.warn("Nenhuma receita encontrada para a faixa:", faixa);
}
})
.catch(err => {
console.warn("Não foi possível carregar as receitas:", err);
});
}

function gerarSugestaoVestuario(temp, precip_mm, wind_kph) {
const faixaTemp = obterFaixaTemperatura(temp);

const sugestoesTemp = {
frio: [
"Dia muito frio, vale um casaco confortável.",
"Está bem frio, agasalhe-se bem para não sentir.",
"Clima gelado, use várias camadas de roupa.",
"Muito frio, não esqueça gorro e luvas.",
"Temperaturas baixas, prefira roupas quentinhas."
],
fresco: [
"Clima fresco, um casaco leve resolve fácil.",
"Fresco e agradável, vista-se com uma blusa leve.",
"Temperatura amena, um suéter é suficiente.",
"Fresco, leve um casaco para o começo do dia.",
"Fresquinho, ideal para roupas de meia estação."
],
agradável: [
"Tempo agradável, roupas confortáveis e leves já bastam.",
"Clima ideal, pode usar roupas casuais confortáveis.",
"Temperatura boa, nada muito pesado ou muito leve.",
"Agradável, ótimo para passeios ao ar livre.",
"Temperatura amena, roupas confortáveis são ideais."
],
calor: [
"Dia quente, prefira roupas leves e tecidos que respiram.",
"Calor moderado, roupa leve e protetor solar.",
"Temperatura alta, prefira algodão e roupas frescas.",
"Calor, ideal para roupas confortáveis e ventiladas.",
"Dia quente, hidratante e roupas leves são essenciais."
],
muitoCalor: [
"Muito calor, vista-se bem leve e não esqueça de se hidratar.",
"Calor intenso, evite roupas apertadas e fique na sombra.",
"Temperaturas muito altas, use chapéu e roupas claras.",
"Calor forte, roupas muito leves e bastante água.",
"Dia de calorão, prefira tecidos naturais e refrescantes."
]
};

function pegarSugestaoAleatoria(lista) {
const indice = Math.floor(Math.random() * lista.length);
return lista[indice];
}

let chaveTemp = faixaTemp;
if (faixaTemp === "muito calor") chaveTemp = "muitoCalor";

const parteTemp = pegarSugestaoAleatoria(sugestoesTemp[chaveTemp] || ["Clima desconhecido, vista-se conforme preferir"]);

const sugestoesChuva = {
garoa: [
" Pode garoar, vale levar uma proteção extra.",
" Leve um capa leve para garantir.",
" Chuvisco esperado, fique atento.",
" Leve um guarda-chuva pequeno.",
" Garoa leve, mas não esqueça a proteção."
],
fraca: [
" Chance de chuva fraca, então leve seu guarda-chuva.",
" Pode chover de leve, tenha seu guarda-chuva à mão.",
" Chuva leve prevista, vale proteger-se.",
" Previsão de chuva fraca, não esqueça do guarda-chuva.",
" Leve chuva esperada, prepare-se."
],
moderada: [
" Previsão de chuva moderada, não esqueça o guarda-chuva.",
" Chuva moderada prevista, fique protegido.",
" Vai chover, melhor levar guarda-chuva resistente.",
" Chuva prevista, não esqueça a proteção.",
" Previsão de chuva, prepare-se para se molhar."
],
forte: [
" Chuva forte prevista, proteja-se bem para não molhar tudo.",
" Chuva intensa, evite sair sem proteção.",
" Fortes chuvas esperadas, cuidado ao sair.",
" Chuva pesada, melhor evitar locais abertos.",
" Previsão de tempestade, fique atento."
],
intensa: [
" Muita chuva esperada, se puder, melhor ficar em casa.",
" Tempestade forte, evite sair.",
" Risco alto de enchentes, tome cuidado.",
" Chuva torrencial, segurança em primeiro lugar.",
" Muita água prevista, proteja-se ao máximo."
],
semChuva: [
" Sem previsão de chuva, pode sair tranquilo.",
" Céu limpo, sem chuva esperada.",
" Tempo seco, aproveite o dia.",
" Sem chuva, dia perfeito para atividades ao ar livre.",
" Clima seco, sem necessidade de proteção extra."
]
};

let chaveChuva = "semChuva";
if (precip_mm > 0.2) {
if (precip_mm <= 1) chaveChuva = "garoa";
else if (precip_mm <= 4) chaveChuva = "fraca";
else if (precip_mm <= 10) chaveChuva = "moderada";
else if (precip_mm <= 20) chaveChuva = "forte";
else chaveChuva = "intensa";
}

const parteChuva = pegarSugestaoAleatoria(sugestoesChuva[chaveChuva]);

const sugestoesVento = {
calminho: [
" Quase sem vento, dia bem calminho.",
" Vento quase inexistente, perfeito para relaxar.",
" Dia tranquilo, sem vento para atrapalhar.",
" Ventania zero, aproveite a calmaria.",
" Clima estável, vento quase nulo."
],
brisaLeve: [
" Brisa leve, perfeita para aproveitar ao ar livre.",
" Ventinho agradável, bom para um passeio.",
" Brisa suave, clima gostoso.",
" Vento leve, nada que incomode.",
" Clima fresco com leve brisa."
],
moderado: [
" Vento moderado, prepare-se para aquela ventania.",
" Ventania moderada, segure os chapéus.",
" Vento presente, cuidado com papéis e folhas.",
" Clima ventoso, bom para esportes ao ar livre.",
" Vento médio, mantenha-se atento."
],
forte: [
" Vento forte, atenção para não bagunçar o visual.",
" Ventania forte, cuidado ao sair de casa.",
" Vento potente, segure os objetos leves.",
" Dia ventoso, melhor evitar locais abertos.",
" Vento agressivo, proteja-se."
],
muitoForte: [
" Vento muito forte, evite áreas abertas e cuide-se.",
" Ventania intensa, melhor ficar protegido.",
" Vento forte demais, evite sair sem necessidade.",
" Ventos muito intensos, segurança em primeiro lugar.",
" Clima perigoso devido ao vento, evite riscos."
]
};

const sugestoesVentoComChuva = {
calminho: [
" Vento calmo, mas atenção com a chuva.",
" Sem vento, mas não esqueça a proteção contra a chuva.",
" Clima tranquilo, apenas se proteja da chuva.",
" Pouco vento e chuva leve - guarda-chuva é essencial.",
" Apesar do clima calmo, a chuva pede precaução."
],
brisaLeve: [
" Leve vento e chuva, atenção redobrada.",
" Brisa leve com possibilidade de chuva, fique atento.",
" Mesmo com brisa suave, proteja-se da chuva.",
" Brisa agradável, mas a chuva exige cuidado.",
" Leve vento e chuvisco - não baixe a guarda."
],
moderado: [
" Vento e chuva moderados, proteja-se bem.",
" Clima instável, com vento e chuva combinados.",
" Vento presente, junto com a chuva - atenção redobrada.",
" Condições medianas de vento e chuva - agasalho e capa são ideais.",
" Vento moderado e chuva contínua - evite longas exposições."
],
forte: [
" Vento forte com chuva, melhor se proteger bem.",
" Ventania e chuva, evite áreas abertas.",
" Dia instável com vento e chuva fortes.",
" Clima severo: ventos fortes e chuva intensa - máxima cautela.",
" Chuvas fortes com vento - evite sair sem necessidade."
],
muitoForte: [
" Vento muito forte e chuva, se possível, fique abrigado.",
" Condições adversas: vento intenso com chuva.",
" Riscos com vento e chuva intensos, evite sair.",
" Tempestade com vento muito forte - permaneça seguro em local fechado.",
" Chuva e ventos extremos - saídas devem ser evitadas ao máximo."
]
};

let chaveVento = "calminho";
if (wind_kph > 10 && wind_kph <= 20) chaveVento = "brisaLeve";
else if (wind_kph <= 30) chaveVento = "moderado";
else if (wind_kph <= 45) chaveVento = "forte";
else chaveVento = "muitoForte";

const usarVentoComChuva = chaveChuva !== "semChuva";
const sugestoesVentoAtuais = usarVentoComChuva ? sugestoesVentoComChuva : sugestoesVento;

const parteVento = pegarSugestaoAleatoria(sugestoesVentoAtuais[chaveVento]);

const sugestaoFinal = `${parteTemp} ${parteChuva}${parteVento}`;
return sugestaoFinal.trim();
}

function getPreciseSeasonDates(year) {
return {
VERÃO:     { date: new Date(year - 1, 11, 21, 12, 0, 0), emoji: "☀️" },
OUTONO:    { date: new Date(year,     2, 20, 12, 0, 0), emoji: "🍂" },
INVERNO:   { date: new Date(year,     5, 21, 12, 0, 0), emoji: "❄️" },
PRIMAVERA: { date: new Date(year,     8, 22, 12, 0, 0), emoji: "🌸" }
};
}

function getCurrentSeason(date = new Date()) {
const year = date.getFullYear();
const seasonDates = getPreciseSeasonDates(year);
const veraoAnterior = getPreciseSeasonDates(year - 1).VERÃO.date;

if (date >= veraoAnterior && date < seasonDates.OUTONO.date) return "VERÃO";
if (date >= seasonDates.OUTONO.date && date < seasonDates.INVERNO.date) return "OUTONO";
if (date >= seasonDates.INVERNO.date && date < seasonDates.PRIMAVERA.date) return "INVERNO";
return "PRIMAVERA";
}

function getSeasonDates(season, year = new Date().getFullYear()) {
const seasonDates = getPreciseSeasonDates(year);
const seasonsOrder = ["VERÃO", "OUTONO", "INVERNO", "PRIMAVERA"];
const currentIndex = seasonsOrder.indexOf(season);
const nextIndex = (currentIndex + 1) % seasonsOrder.length;
const nextSeason = seasonsOrder[nextIndex];

let startDate = seasonDates[season].date;
let endDate;

if (season === "VERÃO") {
startDate = getPreciseSeasonDates(year - 1).VERÃO.date;
endDate = seasonDates.OUTONO.date;
} else if (nextSeason === "VERÃO") {
endDate = getPreciseSeasonDates(year + 1).VERÃO.date;
} else {
endDate = seasonDates[nextSeason].date;
}

return {
start: startDate,
end:   endDate,
emoji: seasonDates[season].emoji,
next:  nextSeason
};
}

async function atualizarEstacao() {
try {
const hoje = new Date();
const ano = hoje.getFullYear();

const estacao = getCurrentSeason(hoje);
const { end, emoji, next } = getSeasonDates(estacao, ano);

const frases = {
VERÃO:     ["Protetor solar! 🧴", "Picolé liberado 🍦", "Praia chamando! 🏖️", "Sol intenso! ☀️"],
OUTONO:    ["Folhas secas 🍁", "Chá perfeito 🍵", "Casaquinho já! 🧥", "Natureza colorida 🍂"],
INVERNO:   ["Chocolate quente 🍫", "Edredom ON 🌙", "Friozinho bom 🎬", "Lareira acesa 🔥"],
PRIMAVERA: ["Flores por toda parte! 🌷", "Beija-flor voltou 🐦", "Piquenique talvez 🧺", "Perfume natural 🌸"]
};

const seasonDates = getPreciseSeasonDates(ano);
const nextEmoji = seasonDates[next].emoji;

function diffMesesDias(inicio, fim) {
let months = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
const temp = new Date(inicio);
temp.setMonth(temp.getMonth() + months);
if (temp > fim) {
months--;
temp.setMonth(temp.getMonth() - 1);
}
const days = Math.round((fim - temp) / 864e5);
return { months, days };
}

const { months: mesesRest, days: diasRest } = diffMesesDias(hoje, end);
const textoRestante = mesesRest > 0
? `${mesesRest} ${mesesRest === 1 ? 'mês' : 'meses'} e ${diasRest} dia${diasRest !== 1 ? 's' : ''}`
: `${diasRest} dia${diasRest !== 1 ? 's' : ''}`;

const formatarDataLonga = (data) => {
const meses = [
'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];
return `${data.getDate()} de ${meses[data.getMonth()]}`;
};

const info = document.getElementById("estacaoInfo");
const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

if (info) {
info.innerHTML = `
<div style="text-align:center; font-size:0.73rem; line-height:1.4; margin-bottom:4px;">
<span style="margin-right:5px;">${emoji}</span>
${capitalize(estacao)} está aí e vai até ${formatarDataLonga(end)}
</div>
<div style="text-align:center; font-size:0.73rem; line-height:1.4;">
<span style="margin-right:5px;">${nextEmoji}</span>
${capitalize(next)} chega em ${textoRestante}
</div>
`;
}

} catch (err) {
console.error('Erro ao atualizar estação:', err);
const info = document.getElementById("estacaoInfo");
if (info) {
info.innerHTML = `
<div style="color:#ff6b6b; padding:10px; background:#fff0f0; border-radius:5px;">
⚠️ Erro ao carregar informações das estações: ${err.message}
</div>
`;
}
}
}

window.addEventListener('load', () => {
atualizarEstacao();
setInterval(atualizarEstacao, 86400000);
});

let temperaturaChart = null;
let precipitacaoChart = null;
let ventoChart = null;

function abrirTelaGraficos() {
const tela = document.getElementById('telaGraficos');
tela.style.display = 'block';
document.body.classList.add('modal-aberto');
setTimeout(() => {
tela.style.opacity = '1';
carregarGraficos();
}, 10);
}

function abrirTelaEscalas() {
fecharModal('Graficos');

const tela = document.getElementById('telaEscalas');

if (tela) {
tela.style.display = 'block';
document.body.classList.add('modal-aberto');
tela.style.zIndex = '10001';
setTimeout(() => {
tela.style.opacity = '1';
}, 10);
}
}

function fecharModal(tipo, event = null) {
if (event) {
event.preventDefault();
event.stopPropagation();
}

const telaAtual = document.getElementById(`tela${tipo}`);
if (telaAtual) {
telaAtual.style.display = "none";
document.body.classList.remove("modal-aberto");
}

if (tipo === "Escalas") {
const telaGraficos = document.getElementById("telaGraficos");
if (telaGraficos) {
telaGraficos.style.display = "block";
document.body.classList.add("modal-aberto");
carregarGraficos();
}

isRefreshing = false;
const pullElement = document.getElementById('pullToRefresh');
return;
}

if (tipo === "Graficos") {
const telaEscalas = document.getElementById("telaEscalas");
if (telaEscalas) {
telaEscalas.style.display = "none";
}

if (temperaturaChart) { temperaturaChart.destroy(); temperaturaChart = null; }
if (precipitacaoChart) { precipitacaoChart.destroy(); precipitacaoChart = null; }
if (ventoChart) { ventoChart.destroy(); ventoChart = null; }
}
}

function getDescricaoPrecipitacao(mm) {
if (mm < 0.2) return "Sem chuva";
if (mm <= 1) return "Garoa leve";
if (mm <= 4) return "Chuva fraca";
if (mm <= 10) return "Moderada";
if (mm <= 20) return "Chuva forte";
if (mm <= 50) return "Muito forte";
return "Chuva extrema";
}

function getDescricaoVento(kph) {
if (kph <= 1) return "Sem vento";
if (kph <= 9) return "Brisinha leve";
if (kph <= 30) return "Vento moderado";
if (kph <= 49) return "Ventania";
if (kph <= 74) return "Quase voando";
if (kph <= 102) return "Muito forte";
return "Destrutivo";
}

function atualizarGraficos(dados) {
if (temperaturaChart) {
temperaturaChart.data.datasets[0].data = dados.temperatura;
temperaturaChart.update();
}
if (precipitacaoChart) {
precipitacaoChart.data.datasets[0].data = dados.precipitacao;
precipitacaoChart.update();
}
if (ventoChart) {
ventoChart.data.datasets[0].data = dados.vento;
ventoChart.update();
}
}

function calcularMedia(dados) {
if (!dados || dados.length === 0) return 0;
return dados.reduce((soma, valor) => soma + valor, 0) / dados.length;
}

function destruirGraficos() {
if (typeof temperaturaChart !== "undefined" && temperaturaChart) {
temperaturaChart.destroy();
temperaturaChart = null;
}
if (typeof precipitacaoChart !== "undefined" && precipitacaoChart) {
precipitacaoChart.destroy();
precipitacaoChart = null;
}
if (typeof ventoChart !== "undefined" && ventoChart) {
ventoChart.destroy();
ventoChart = null;
}
}

function getEmojiFromTemperature(temp) {
  const faixa = emojiByTemperature.find(range => temp >= range.min && temp <= range.max);
  return faixa.emoji;
}

function getDescricaoFromTemperature(temp) {
const emoji = getEmojiFromTemperature(temp);
return descricoes[emoji] || "Desconhecido";
}

async function carregarGraficos() {
if (!weatherCache) {
console.log("Aguardando dados do tempo…");
return;
}

if (typeof Chart === "undefined") {
console.error('Chart.js não está carregado!');
return;
}

destruirGraficos();

const forecast = weatherCache.forecast;
const horasDia1 = forecast.forecast.forecastday[0].hour;
const horasDia2 = forecast.forecast.forecastday[1]?.hour || [];
const todasHoras = [...horasDia1, ...horasDia2];

const agora = new Date();
const horasFiltradas = todasHoras
.filter(h => {
const diff = (new Date(h.time) - agora) / 3.6e6;
return diff >= 0 && diff <= 24;
})
.sort((a, b) => new Date(a.time) - new Date(b.time));

if (!horasFiltradas.length) return;

const labels = horasFiltradas.map(h => `${new Date(h.time).getHours()}h`);
const tempData = horasFiltradas.map(h => h.temp_c);
const precipData = horasFiltradas.map(h => h.precip_mm);
const ventoData = horasFiltradas.map(h => h.wind_kph);

const mediaTemp24h = calcularMedia(tempData);
const mediaPrecip24h = calcularMedia(precipData);
const mediaVento24h = calcularMedia(ventoData);
const minTemp24h = Math.min(...tempData);
const maxTemp24h = Math.max(...tempData);

const emojiTemp = getEmojiFromTemperature(mediaTemp24h);
const descricaoPrecip = getDescricaoPrecipitacao(mediaPrecip24h);
const descricaoVento = getDescricaoVento(mediaVento24h);
const legendaTemp = `${emojiTemp} ${descricoes[emojiTemp] || ""}`.trim();

const tendencia = (() => {
if (tempData.length < 5) return 0;
const diff = calcularMedia(tempData.slice(1, 5)) - tempData[0];
return Math.abs(diff) > 0.5 ? diff : 0;
})();
const setaTendencia = tendencia > 0 ? "▲" : tendencia < 0 ? "▼" : "⬤";

if (temperaturaChart && precipitacaoChart && ventoChart) {
atualizarGraficos({
temperatura: tempData,
precipitacao: precipData,
vento: ventoData
});
return;
}

const tempCtx = document.getElementById('temperaturaChart').getContext('2d');
temperaturaChart = new Chart(tempCtx, {
type: 'line',
data: {
labels,
datasets: [{
label: `🌡️ min ${minTemp24h.toFixed(1)}° / max ${maxTemp24h.toFixed(1)}° ${legendaTemp} ${setaTendencia}`,
data: tempData,
borderColor: '#ffeb3b',
backgroundColor: 'rgba(255, 235, 59, 0.1)',
borderWidth: 2,
fill: true
}]
},
options: {
responsive: true,
plugins: {
legend: {
labels: {
color: '#ffeb3b',
font: { size: 15 },
usePointStyle: true,
boxWidth: 0
}
}
},
scales: {
x: { ticks: { color: 'white' }, grid: { color: 'rgba(255,255,255,0.1)' } },
y: { ticks: { color: 'white' }, grid: { color: 'rgba(255,255,255,0.1)' } }
}
}
});

const precipCtx = document.getElementById('precipitacaoChart').getContext('2d');
precipitacaoChart = new Chart(precipCtx, {
type: 'line',
data: {
labels,
datasets: [{
label: `🌧️ Média ${mediaPrecip24h.toFixed(1)} mm – ${descricaoPrecip}`,
data: precipData,
borderColor: '#42a5f5',
backgroundColor: 'rgba(66, 165, 245, 0.1)',
borderWidth: 2,
fill: true
}]
},
options: {
responsive: true,
plugins: {
legend: {
labels: {
color: '#42a5f5',
font: { size: 15 },
usePointStyle: true,
boxWidth: 0
}
}
},
scales: {
x: { ticks: { color: 'white' }, grid: { color: 'rgba(255,255,255,0.1)' } },
y: { ticks: { color: 'white' }, grid: { color: 'rgba(255,255,255,0.1)' } }
}
}
});

const ventoCtx = document.getElementById('ventoChart').getContext('2d');
ventoChart = new Chart(ventoCtx, {
type: 'line',
data: {
labels,
datasets: [{
label: `🍃 Média ${mediaVento24h.toFixed(1)} km/h – ${descricaoVento}`,
data: ventoData,
borderColor: '#4caf50',
backgroundColor: 'rgba(76, 175, 80, 0.1)',
borderWidth: 2,
fill: true
}]
},
options: {
responsive: true,
plugins: {
legend: {
labels: {
color: '#4caf50',
font: { size: 15 },
usePointStyle: true,
boxWidth: 0
}
}
},
scales: {
x: { ticks: { color: 'white' }, grid: { color: 'rgba(255,255,255,0.1)' } },
y: { ticks: { color: 'white' }, grid: { color: 'rgba(255,255,255,0.1)' } }
}
}
});

const sugestaoVestuario = gerarSugestaoVestuario(
mediaTemp24h,
mediaPrecip24h,
mediaVento24h
);

const sugestaoDiv = document.createElement('div');
sugestaoDiv.style.marginTop = '15px';
sugestaoDiv.style.padding = '10px';
sugestaoDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
sugestaoDiv.style.borderRadius = '8px';
sugestaoDiv.style.fontSize = '10.5px';
sugestaoDiv.style.textAlign = 'left';
sugestaoDiv.style.lineHeight = '1.4';
sugestaoDiv.innerHTML = `<strong style="color: #ffeb3b;">Dica para o dia:</strong> ${sugestaoVestuario}`;

const ultimoGrafico = document.querySelector('.grafico:last-child');
if (ultimoGrafico && ultimoGrafico.parentNode) {
ultimoGrafico.parentNode.appendChild(sugestaoDiv);
}
}

async function carregarChartJS() {
return new Promise((resolve, reject) => {
if (typeof Chart !== 'undefined') {
resolve();
return;
}

const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
script.onload = () => resolve();
script.onerror = () => reject(new Error('Falha ao carregar Chart.js'));
document.head.appendChild(script);
});
}

function calcularMedias24h(forecastData) {
const agora = new Date();
const horasDia1 = forecastData.forecast.forecastday[0].hour;
const horasDia2 = forecastData.forecast.forecastday[1]?.hour || [];
const todasHoras = [...horasDia1, ...horasDia2];

const proximas24h = todasHoras.filter(h => {
const diff = (new Date(h.time) - agora) / 3.6e6;
return diff >= 0 && diff <= 24;
});

const temp = proximas24h.map(h => h.temp_c);
const precip = proximas24h.map(h => h.precip_mm);
const vento = proximas24h.map(h => h.wind_kph);

return {
mediaTemp: calcularMedia(temp),
mediaPrecip: calcularMedia(precip),
mediaVento: calcularMedia(vento)
};
}

const faixaEmojis = [
'🧊', '🥶', '❄️', '🧥', '🧣', '🍃', '⛅', '🌤️', '☀️', '🕶️', '🔥', '🥵', '♨️'
];

const messagesByTemperature = [
  {
    min: -Infinity,
    max: 0.9,
    messages: ['Frio intenso! ❄️', 'Muito frio! 🥶']
  },
  {
    min: 1.0,
    max: 10.9,
    messages: ['Frio! 🧣', 'Temperatura baixa! 🧥']
  },
  {
    min: 11.0,
    max: 20.9,
    messages: ['Temperatura amena! 🍃', 'Clima agradável! ⛅']
  },
  {
    min: 21.0,
    max: 30.9,
    messages: ['Clima quente! ☀️', 'Dia ensolarado! 🕶️']
  },
  {
    min: 31.0,
    max: Infinity,
    messages: ['Calor intenso! 🔥', 'Muito calor! 🥵']
  }
];

const descricoes = {
  "🧊": "Congelante",
  "🥶": "Gélido",
  "❄️": "Frio",
  "🧥": "Fresco",
  "🧣": "Suave",
  "🍃": "Ameno",
  "⛅": "Temperado",
  "🌤️": "Quente",
  "☀️": "Tórrido",
  "🕶️": "Escaldante",
  "🔥": "Abrassador",
  "🥵": "Intenso",
  "♨️": "Extremo"
};

const emojiByTemperature = [
  { min: -50, max: -0.1, emoji: "🧊" },
  { min: 0,   max: 2.9, emoji: "🥶" },
  { min: 3,   max: 5.9, emoji: "❄️" },
  { min: 6,   max: 8.9, emoji: "🧥" },
  { min: 9,   max: 11.9, emoji: "🧣" },
  { min: 12,  max: 14.9, emoji: "🍃" },
  { min: 15,  max: 17.9, emoji: "⛅" },
  { min: 18,  max: 20.9, emoji: "🌤️" },
  { min: 21,  max: 24.9, emoji: "☀️" },
  { min: 25,  max: 28.9, emoji: "🕶️" },
  { min: 29,  max: 32.9, emoji: "🔥" },
  { min: 33,  max: 36.9, emoji: "🥵" },
  { min: 37,  max: 100, emoji: "♨️" }
];

function getSpecialDateMessage() {
const hoje = new Date();
const dia = hoje.getDate();
const mes = hoje.getMonth() + 1;
const anoAtual = hoje.getFullYear();

const mensagensEspeciais = {
'1-1'  : `Feliz Ano Novo Baron! Que ${anoAtual} seja repleto de conquistas!`,
'28-1' : `Hoje a Bruna está comemorando aniversário!`,
'30-1' : `Hoje Marlon está de niver e comemora ${anoAtual - 1988} anos!`,
'7-2'  : `Parabéns para Clara! Hoje ela comemora ${anoAtual - 2016} anos!`,
'12-2' : `Hoje é aniversário do Sérgio. Ele comemora ${anoAtual - 1969} anos!`,
'5-3'  : 'Hoje é seu aniversário! Parabéns!',
'9-3'  : 'Seu pai está fazendo aniversário hoje! Parabéns pra ele!',
'23-3' : `Amanhã é o niver do seu filho Eduardo. Ele faz ${anoAtual - 2003} anos!`,
'5-4'  : 'Hoje é uma data especial: você conheceu a Cláudia.',
'2-5'  : `Feliz aniversário para Mateus que comemora ${anoAtual - 2001} anos!`,
'5-6'  : 'Hoje você e Cláudia começaram a dividir a vida.',
'12-6' : 'Feliz Dia dos Namorados! Que o amor de vocês cresça a cada dia.',
'5-7'  : `Sua irmã Débora está de aniversário. Ela comemora ${anoAtual - 1973} anos!`,
'5-9'  : 'Feliz aniversário para Cláudia! Que tal um jantar especial?',
'23-10': 'Hoje sua mãe comemora aniversário. Parabéns pra ela!',
'5-11' : 'Aniversário de casamento. Juntos e fortes! Que tal levar um bom vinho?',
'25-11': `Hoje a sua irmã Morgama está de niver. Ela comemora ${anoAtual - 1984} anos!`,
'25-12': 'Feliz Natal Baron! Que esse feriado envolva você com muita paz.'
};

const chave1 = `${dia}-${mes}`;
const chave2 = `${dia.toString().padStart(2,'0')}-${mes}`;

return mensagensEspeciais[chave1] || mensagensEspeciais[chave2] || null;
}

function getMessageForTemperature(temp, isInitialLoad = false) {
const especialHoje = getSpecialDateMessage();
if (especialHoje) {
currentTemperatureMessage = especialHoje;
return currentTemperatureMessage;
}

if (isInitialLoad) {
const group = messagesByTemperature.find(
range => temp >= range.min && temp <= range.max
);

if (group) {
const randomIndex = Math.floor(Math.random() * group.messages.length);
const emojiInfo = emojiByTemperature.find(
faixa => temp >= faixa.min && temp <= faixa.max
);
const emoji = emojiInfo ? emojiInfo.emoji : '';
currentTemperatureMessage = `${emoji} ${group.messages[randomIndex]}`;
} else {
currentTemperatureMessage = 'Aproveite o dia!';
}
}

return currentTemperatureMessage;
}

function atualizarMensagemTemperatura() {
const messageDiv = document.getElementById('weatherMessage');
if (messageDiv) {
messageDiv.innerHTML = currentTemperatureMessage;
}
}

async function fetchAllWeatherData(lat, lon, forceRefresh = false) {
const now = Date.now();
const cacheKey = `weather_${lat}_${lon}`;

let cachedData = null;

if (!forceRefresh) {
cachedData = lerCache(cacheKey);
if (cachedData) {
weatherCache = cachedData;
weatherLastFetch = now;
return cachedData;
}
}

try {
if (!navigator.onLine) {
throw new Error("Sem conexão com a internet");
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);

const [current, forecast, astronomy] = await Promise.all([
getCurrentWeather(lat, lon, controller.signal),
getForecast(lat, lon, 2),
getAstronomy(lat, lon, 'today', controller.signal)
]);

clearTimeout(timeout);

const data = {
current: current || {},
forecast: forecast || { forecast: { forecastday: [] } },
astronomy: astronomy || {}
};

if (!data.current.temp_c && (!data.forecast.forecast || !data.forecast.forecast.forecastday)) {
throw new Error("Dados insuficientes da API");
}

weatherCache = data;
weatherLastFetch = now;

salvarCache(cacheKey, data, 10);

return data;

} catch (error) {
console.error("Erro ao buscar dados:", error.message || error);

if (!cachedData) {
cachedData = lerCache(cacheKey);
}

if (cachedData) {
console.warn("Usando dados em cache devido ao erro");
return cachedData;
}

return {
current: {
temp_c: 0,
humidity: 0,
precip_mm: 0,
wind_kph: 0,
feelslike_c: 0,
condition: { code: 1000, text: 'Desconhecido' },
is_day: 1
},
forecast: { forecast: { forecastday: [] } },
astronomy: {}
};
}
}

async function getCurrentWeather(lat, lon, signal) {
try {
const response = await fetch(
`https://meu-projeto-clima.vercel.app/api/weather?cidade=${lat},${lon}&tipo=current`,
{ signal }
);

if (!response.ok) {
throw new Error(`HTTP error ${response.status}`);
}

const contentType = response.headers.get("content-type");
if (!contentType || !contentType.includes("application/json")) {
const text = await response.text();
throw new Error("Resposta não é JSON. Conteúdo recebido: " + text.substring(0, 100));
}

const data = await response.json();
return data.error ? null : data.current;
} catch (error) {
console.error("Erro ao obter clima atual:", error.message);
return null;
}
}

async function getForecast(lat, lon, days = 2) { 
try { 
const response = await fetch(`https://meu-projeto-clima.vercel.app/api/weather?cidade=${lat},${lon}&tipo=forecast&days=${days}`); 

if (!response.ok) {
throw new Error(`HTTP error! status: ${response.status}`);
}

const data = await response.json(); 

if (data.error) {
throw new Error(data.error);
}

return data; 
} catch (error) { 
console.error('Erro ao obter previsão:', error, error.message); 
return null; 
} 
}

async function getAstronomy(lat, lon, date = 'today') { 
try { 
const response = await fetch(`https://meu-projeto-clima.vercel.app/api/weather?cidade=${lat},${lon}&tipo=astronomy&date=${date}`); 
const data = await response.json(); 

if (data.error) {
throw new Error(data.error);
}

return data; 
} catch (error) { 
console.error('Erro ao obter dados astronômicos:', error); 
return null; 
} 
}

function getWeatherIcon(code, isDay) { 
const basePath = 'https://cdn.weatherapi.com/weather/64x64'; 
const time = isDay ? 'day' : 'night'; 
const iconMap = { 
'1000': `${time}/113.png`,
'1003': `${time}/116.png`,
'1006': `${time}/119.png`,
'1009': `${time}/122.png`,
'1030': `${time}/143.png`,
'1063': `${time}/176.png`,
'1066': `${time}/179.png`,
'1069': `${time}/182.png`,
'1072': `${time}/185.png`,
'1087': `${time}/200.png`,
'1114': `${time}/227.png`,
'1117': `${time}/230.png`,
'1135': `${time}/248.png`,
'1147': `${time}/260.png`,
'1150': `${time}/263.png`,
'1153': `${time}/266.png`,
'1168': `${time}/281.png`,
'1171': `${time}/284.png`,
'1180': `${time}/293.png`,
'1183': `${time}/296.png`,
'1186': `${time}/299.png`,
'1189': `${time}/302.png`,
'1192': `${time}/305.png`,
'1195': `${time}/308.png`,
'1198': `${time}/311.png`,
'1201': `${time}/314.png`,
'1204': `${time}/317.png`,
'1207': `${time}/320.png`,
'1210': `${time}/323.png`,
'1213': `${time}/326.png`,
'1216': `${time}/329.png`,
'1219': `${time}/332.png`,
'1222': `${time}/335.png`,
'1225': `${time}/338.png`,
'1237': `${time}/350.png`,
'1240': `${time}/353.png`,
'1243': `${time}/356.png`,
'1246': `${time}/359.png`,
'1249': `${time}/362.png`,
'1252': `${time}/365.png`,
'1255': `${time}/368.png`,
'1258': `${time}/371.png`,
'1261': `${time}/374.png`,
'1264': `${time}/377.png`,
'1273': `${time}/386.png`,
'1276': `${time}/389.png`,
'1279': `${time}/392.png`,
'1282': `${time}/395.png`,
}; 
return basePath + '/' + (iconMap[code] || `${time}/113.png`);
}

async function buscarPrevisaoPorGeolocalizacao(isInitialLoad = true) {
const locationDateDiv = document.getElementById('locationDate');
const resultDiv = document.getElementById('weatherResult');
const statusDiv = document.getElementById('status');

if (!navigator.geolocation) {
if(resultDiv) {
resultDiv.innerHTML = '<p style="color:#ffcfcf;">Geolocalização não suportada pelo seu navegador.</p>';
}
return;
}

if(statusDiv) {
statusDiv.innerHTML = `
<p style="color:#ccc;font-size:0.75em;">Buscando dados do tempo…</p>
<div class="progress-bar-small"><div class="progress"></div></div>
`;
}

try {
const position = await new Promise((resolve, reject) => {
const geoTimeout = setTimeout(() =>
reject(new Error('Timeout geolocalização')), 15000);

navigator.geolocation.getCurrentPosition(
pos => {
clearTimeout(geoTimeout);
resolve(pos);
},
err => {
clearTimeout(geoTimeout);
reject(err);
},
{ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
);
});

const lat = position.coords.latitude;
const lon = position.coords.longitude;

let cidade = '', bairro = '';

try {
const NOMINATIM_URL = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=pt-BR`;
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);

const resGeo = await fetch(NOMINATIM_URL, {
headers: { 'User-Agent': 'MeuClima/1.0 (local testing)' },
mode: 'cors',
cache: 'no-cache',
credentials: 'omit',
signal: controller.signal
});

clearTimeout(timeoutId);

if (!resGeo.ok) throw new Error(`HTTP ${resGeo.status}`);

const dataGeo = await resGeo.json();

bairro = dataGeo.address?.suburb ?? dataGeo.address?.neighbourhood ?? '';
cidade = dataGeo.address?.city ?? dataGeo.address?.town ?? dataGeo.address?.state ?? '';

if (!cidade) {
cidade = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
bairro = '';
console.warn('Cidade não encontrada, usando coordenadas como fallback.');
}

} catch (e) {
bairro = '';
cidade = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

if (!cidade) {
try {
const BIGDATA_URL = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`;
const controller2 = new AbortController();
const timeoutId2 = setTimeout(() => controller2.abort(), 5000);

const resGeo2 = await fetch(BIGDATA_URL, {
signal: controller2.signal
});

clearTimeout(timeoutId2);

if (resGeo2.ok) {
const dataGeo2 = await resGeo2.json();
cidade = dataGeo2.city || dataGeo2.locality || dataGeo2.principalSubdivision || '';
bairro = dataGeo2.localityInfo?.administrative?.[0]?.name || '';
}
} catch (e) {
console.error('Erro ao obter nome da localização via BigDataCloud:', e);
}
}

if (!cidade) {
cidade = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
console.log('Usando coordenadas como fallback para localização');
}

const weatherData = await fetchAllWeatherData(lat, lon);

verificarAlertas(weatherData);

const { current: currentWeather } = weatherData;

const dias = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const hoje = new Date();
const dataFormatada = `${dias[hoje.getDay()]}, ${hoje.getDate()} de ${meses[hoje.getMonth()]}`;

if(locationDateDiv) {
locationDateDiv.innerHTML = `${bairro ? bairro + ', ' : ''}${cidade} 🕐 ${dataFormatada}`;
}

const iconCode = currentWeather?.condition?.code ?? 1000;
const isDay = currentWeather?.is_day ?? 1;
const temp_c = currentWeather?.temp_c ?? 0;
const humidity = currentWeather?.humidity ?? 0;
const precip_mm = currentWeather?.precip_mm ?? 0;
const wind_kph = currentWeather?.wind_kph ?? 0;
const feelslike_c = currentWeather?.feelslike_c ?? 0;
const condText = currentWeather?.condition?.text ?? 'Desconhecido';
mostrarSugestaoReceita(temp_c);

const weatherIcon = await getWeatherIcon(iconCode, isDay);

if (resultDiv) {
resultDiv.innerHTML = `
<div class="big-icon">
<img src="${weatherIcon}" class="weather-icon" alt="${condText}">
${temp_c.toFixed(1)}°C
</div>

<div class="info-inline">
<div class="info-item">
<span>💧</span>
<span class="weather-value" style="color:#ffeb3b;">${humidity}%</span>
</div>

<div class="info-item">
<span>🌧️</span>
<span class="weather-value" style="color:#ffeb3b;">${precip_mm.toFixed(1)} mm</span>
</div>

<div class="info-item">
<span>🍃</span>
<span class="weather-value" style="color:#ffeb3b;">${wind_kph.toFixed(1)} km/h</span>
</div>

<div class="info-item">
<span>🌡️</span>
<span class="weather-value" style="color:#ffeb3b;">${feelslike_c}°C</span>
</div>
</div>
`;
}

if (isInitialLoad && currentWeather && currentWeather.temp_c !== undefined) {
getMessageForTemperature(currentWeather.temp_c, true);
atualizarMensagemTemperatura();
}

if (lat && lon) {
buscarExtras(lat, lon);
}

if(statusDiv) statusDiv.innerHTML = '';

} catch (error) {
console.error('Erro ao buscar previsão:', error);

let errorMessage = '';

if (error instanceof GeolocationPositionError) {
switch (error.code) {
case error.PERMISSION_DENIED:
errorMessage = 'Permissão de localização negada. Por favor, habilite a localização para usar o aplicativo.';
break;
case error.POSITION_UNAVAILABLE:
errorMessage = 'Localização indisponível. Verifique suas configurações de GPS/rede.<br><button onclick="reiniciarBusca()" style="margin-top:10px;">🔄 Tentar de novo</button>';
break;
case error.TIMEOUT:
errorMessage = 'Tempo limite excedido ao tentar obter a localização.<br><button onclick="reiniciarBusca()" style="margin-top:10px;">🔄 Tentar de novo</button>';
break;
default:
errorMessage = 'Erro desconhecido na geolocalização.<br><button onclick="reiniciarBusca()" style="margin-top:10px;">🔄 Tentar de novo</button>';
}
} else if (error.message === 'Timeout geolocalização') {
errorMessage = 'Localização demorou muito para responder. Verifique seu GPS e tente novamente.<br><button onclick="reiniciarBusca()" style="margin-top:10px;">🔄 Tentar de novo</button>';
} else if (error.message === "Sem conexão com a internet") {
errorMessage = 'Você está offline. Conecte-se à internet para atualizar os dados...<br><button onclick="reiniciarBusca()" style="margin-top:10px;">🔄 Tentar de novo</button>';
} else if (error.message.includes("HTTP error")) {
errorMessage = 'Erro de comunicação com o servidor: ' + error.message + '.<br><button onclick="reiniciarBusca()" style="margin-top:10px;">🔄 Tentar de novo</button>';
} else if (error.message.includes("Dados insuficientes da API")) {
errorMessage = "Não foi possível obter todos os dados. Tente novamente mais tarde...<br><button onclick=\"reiniciarBusca()\" style=\"margin-top:10px;\">🔄 Tentar de novo</button>";
} else {
errorMessage = "Ocorreu um erro inesperado. Tente novamente.<br><button onclick=\"reiniciarBusca()\" style=\"margin-top:10px;\">🔄 Tentar de novo</button>";
}

if (resultDiv) {
resultDiv.innerHTML = `
<div style="color:#ff6f00;text-align:center;padding:20px;">
<p>${errorMessage}</p>
</div>`;
}

if (statusDiv) {
statusDiv.innerHTML = '';
}
} finally {
finalizarPullToRefresh?.();
if (typeof splashTimeoutId !== 'undefined') clearTimeout(splashTimeoutId);
esconderSplashSuavemente();
}
}

function esconderSplashSuavemente() {
const splash = document.getElementById('splashScreen');
splash.style.opacity = '0';
setTimeout(() => (splash.style.display = 'none'), 500);
}

function esconderSplashComErro(msg) {
esconderSplashSuavemente();
const resultDiv = document.getElementById('weatherResult');
resultDiv.innerHTML = `
<div style="color:#ff6f00;text-align:center;padding:20px;">
<p>${msg}</p>
<p style="font-size: 0.8em; color: #ccc; margin-top: 10px;">Tentando novamente...</p>
</div>`;
reiniciarBuscaAutomatica();
}

function reiniciarBuscaComRetry(maxTentativas = 3, intervalo = 5000) {
const resultDiv = document.getElementById('weatherResult');
const statusDiv = document.getElementById('status');

if (resultDiv) {
resultDiv.innerHTML = `
<div style="color:#ff6f00;text-align:center;padding:20px;">
<p>Não foi possível carregar os dados. Tentando novamente...</p>
</div>`;
}

if (statusDiv) {
statusDiv.innerHTML = `
<p style="color:#ccc;font-size:0.75em;">Tentando reconectar...</p>
<div class="progress-bar-small"><div class="progress"></div></div>`;
}

tentarComRetry(() => buscarPrevisaoPorGeolocalizacao(true), maxTentativas, intervalo)
.catch(err => {
if (resultDiv) {
resultDiv.innerHTML = `
<div style="color:#ff6f00;text-align:center;padding:20px;">
<p>Erro após várias tentativas: ${err.message}</p>
<button onclick="reiniciarBuscaComRetry()" 
style="margin-top:10px; background:#ff6f00; color:white; border:none; padding:5px 10px; border-radius:3px;">
Tentar novamente
</button>
</div>`;
}
});
}

function mostrarErroSplash(mensagem) {
const splash = document.getElementById('splashScreen');
if (splash) {
splash.innerHTML = `
<div style="text-align: center; padding: 20px;">
<p style="color: #ff6f00;">${mensagem}</p>
<p style="font-size: 0.8em; color: #ccc; margin-top: 10px;">Tentando novamente...</p>
</div>
`;
setTimeout(() => reiniciarBuscaComRetry(), 3000);
}
}

async function buscarExtras(lat, lon) {
const extrasDiv = document.getElementById('extras');
const moonDiv = document.getElementById('moonInfo');
const now = Date.now();

try {
const weatherData = await fetchAllWeatherData(lat, lon);

if (!weatherData.astronomy || !weatherData.forecast) {
throw new Error("Dados astronômicos ou de previsão insuficientes.");
}

const astronomy = weatherData.astronomy;
const forecast = weatherData.forecast;

const medias = calcularMedias24h(forecast);
const sugestaoVestuario = gerarSugestaoVestuario(
medias.mediaTemp,
medias.mediaPrecip,
medias.mediaVento
);

const sugestaoDiv = document.createElement('div');
sugestaoDiv.style.marginTop = '1px';
sugestaoDiv.style.padding = '10px';
sugestaoDiv.style.borderRadius = '8px';
sugestaoDiv.style.fontSize = '10.5px';
sugestaoDiv.style.textAlign = 'center';
sugestaoDiv.style.lineHeight = '1.4';
sugestaoDiv.innerHTML = `<strong style="color: #ffeb3b;">Dica para o dia:</strong> ${sugestaoVestuario}`;

moonDiv.innerHTML = '';
moonDiv.appendChild(sugestaoDiv);

setTimeout(() => {
const moonInfo = getMoonInfo(astronomy.moon_phase, astronomy.moon_illumination);
const iluminacaoValor = parseFloat(astronomy.moon_illumination.toFixed(1));

const openMoonModal = () => {
const modal = document.createElement('div');
modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000c1a;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;color:white;';
const titulo = document.createElement('div');
titulo.style.cssText = 'font-size:22px;font-weight:bold;color:#ffeb3b;margin-bottom:8px;';
titulo.textContent = moonInfo.emoji + ' ' + moonInfo.pt;
const sub = document.createElement('div');
sub.style.cssText = 'font-size:14px;color:#ccc;margin-bottom:24px;';
sub.textContent = 'Iluminação: ' + iluminacaoValor + '%';
const svgNS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(svgNS, 'svg');
svg.setAttribute('width','200');svg.setAttribute('height','200');svg.setAttribute('viewBox','0 0 200 200');
const defs = document.createElementNS(svgNS,'defs');
const clip = document.createElementNS(svgNS,'clipPath');clip.setAttribute('id','mc');
const cc = document.createElementNS(svgNS,'circle');cc.setAttribute('cx','100');cc.setAttribute('cy','100');cc.setAttribute('r','80');
clip.appendChild(cc);defs.appendChild(clip);svg.appendChild(defs);
const bg = document.createElementNS(svgNS,'circle');bg.setAttribute('cx','100');bg.setAttribute('cy','100');bg.setAttribute('r','80');bg.setAttribute('fill','#1a1a2e');svg.appendChild(bg);
// Textura lunar: crateras sobre o fundo escuro
const cratersData = [
  [72,65,10],[130,80,7],[55,120,6],[140,130,12],[90,150,5],
  [115,50,8],[60,90,4],[145,75,5],[80,105,7],[120,155,6],
  [100,85,9],[50,145,5],[135,110,4],[75,55,5],[110,130,8]
];
cratersData.forEach(([cx,cy,r]) => {
  const cr = document.createElementNS(svgNS,'circle');
  cr.setAttribute('cx',cx);cr.setAttribute('cy',cy);cr.setAttribute('r',r);
  cr.setAttribute('fill','#0d0d1f');
  cr.setAttribute('opacity','0.55');
  cr.setAttribute('clip-path','url(#mc)');
  svg.appendChild(cr);
});
const pct = iluminacaoValor / 100;
const isMinguante = moonInfo.pt.toLowerCase().includes('minguante');
// Elipse clipada: rx proporcional ao pct, deslocada para a borda iluminada
const rxLit = Math.max(0.5, pct * 80);
const cxLit = isMinguante ? (100 - (80 - rxLit)) : (100 + (80 - rxLit));
const litEl = document.createElementNS(svgNS,'ellipse');
litEl.setAttribute('cx', cxLit.toFixed(1));
litEl.setAttribute('cy','100');
litEl.setAttribute('rx', rxLit.toFixed(1));
litEl.setAttribute('ry','80');
litEl.setAttribute('fill','#fffde7');
litEl.setAttribute('clip-path','url(#mc)');
svg.appendChild(litEl);
const closeBtn = document.createElement('button');closeBtn.textContent='Fechar';closeBtn.style.cssText='margin-top:28px;background:transparent;border:1px solid #ffeb3b;color:#ffeb3b;padding:8px 28px;border-radius:20px;font-size:14px;cursor:pointer;';closeBtn.onclick=()=>document.body.removeChild(modal);
modal.appendChild(titulo);modal.appendChild(svg);modal.appendChild(sub);modal.appendChild(closeBtn);document.body.appendChild(modal);
};


const moonHTML = `
<div class="info-inline moon-text" style="font-size: 1.1em; overflow-x: auto;">
<div class="info-item" style="display: flex; align-items: center; flex-wrap: nowrap; gap: 15px; white-space: nowrap;">
<span>
<a href="#" 
onclick="openMoonModal(); return false;"
style="color: inherit; text-decoration: none; cursor: pointer;">
Lua <span class="moon-emoji">${moonInfo.emoji}</span> ${moonInfo.pt} em ${iluminacaoValor}% ✨
</a>
</span>
</div>
</div>
`;

window.openMoonModal = openMoonModal;

moonDiv.innerHTML = moonHTML;
extrasCache.moon = moonHTML;
}, 10000);

const hoje = forecast.forecast.forecastday[0];
const horaAtual = new Date().getHours();

const periodosNomes = [
['Manhã', 'Tarde', 'Noite', 'Aurora'],
['Tarde', 'Noite', 'Aurora', 'Manhã'],
['Noite', 'Aurora', 'Manhã', 'Tarde'],
['Aurora', 'Manhã', 'Tarde', 'Noite']
];

const conjuntoNomes = Math.floor(horaAtual / 6);
const nomesPeriodos = periodosNomes[conjuntoNomes % 4];
let periodos = [];

for (let i = 0; i < 3; i++) {
const horaInicio = (horaAtual + (i * 6)) % 24;
const horaFim = (horaInicio + 6) % 24;
const periodo = hoje.hour.filter(h => {
const hora = new Date(h.time).getHours();
return horaInicio < horaFim
? hora >= horaInicio && hora < horaFim
: hora >= horaInicio || hora < horaFim;
});

periodos.push({
nome: nomesPeriodos[i],
horas: periodo,
isDay: horaInicio >= 6 && horaInicio < 18
});
}

const tempMedia = (period) => {
if (!period || period.length === 0) return '0.0';
const temps = period.map(h => h.temp_c);
const sum = temps.reduce((a, b) => a + b, 0);
return (sum / temps.length).toFixed(1);
};

const getPeriodSymbol = (period) => {
const symbols = period.map(h => h.condition.code);
const counts = {};
symbols.forEach(s => counts[s] = (counts[s] || 0) + 1);
return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
};

let periodosHTML = '';
for (let i = 0; i < periodos.length; i++) {
const periodo = periodos[i];
const temp = tempMedia(periodo.horas);
const symbol = getPeriodSymbol(periodo.horas);

periodosHTML += `
<div class="info-item" style="display: flex; flex-direction: column; align-items: center; margin-bottom: 8px; ${i < periodos.length - 1 ? 'border-right: 1px solid #ffeb3b; padding-right: 12px;' : ''}">
<div style="display: flex; align-items: baseline; gap: 6px;">
<div style="font-weight: 600; color: #ffffff;">${periodo.nome}</div>
<div style="font-size: 1.1em; font-weight: bold; color: #ffeb3b;">${temp}°C</div>
</div>
<img src="${await getWeatherIcon(symbol, periodo.isDay)}" alt="" class="weather-icon small-weather-icon" style="margin-top: 4px;">
</div>
`;
}

const amanha = forecast.forecast.forecastday[1];
const diasSemana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const dataAtual = new Date();
const dataAmanha = new Date(dataAtual);
dataAmanha.setDate(dataAtual.getDate() + 1);

const anoAmanha = dataAmanha.getFullYear();
const mesAmanha = dataAmanha.getMonth();
const diaAmanha = dataAmanha.getDate();

const horasAmanha = amanha.hour.filter(h => {
const dataHora = new Date(h.time);
return (
dataHora.getFullYear() === anoAmanha &&
dataHora.getMonth() === mesAmanha &&
dataHora.getDate() === diaAmanha
);
});

const tempsAmanha = horasAmanha.map(h => h.temp_c);
const minAmanha = Math.min(...tempsAmanha);
const maxAmanha = Math.max(...tempsAmanha);
const iconUrl = await getWeatherIcon(amanha.day.condition.code, true);
const nomeDia = diasSemana[dataAmanha.getDay()];
const nomeDiaMinusculo = nomeDia;

const amanhaHTML = `
<div class="previsao-amanha">
<div class="info">
<div class="titulo-previsao" style="font-size: 12px;">Previsão para amanhã,&nbsp;${nomeDiaMinusculo}</div>
<div class="temp-previsao" style="font-size: 12px;">Mín: ${minAmanha.toFixed(1)}°C / Máx: ${maxAmanha.toFixed(1)}°C</div>
</div>
<div class="icon">
<img src="${iconUrl}" alt="Ícone da previsão">
</div>
</div>
`;

const htmlCompletoExtras = `
<div class="info-inline" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
${periodosHTML}
</div>
<div style="margin: 10px 0; padding: 0; border-top: 1px solid rgba(255, 255, 255, 0.3);"></div>
${amanhaHTML}
`;

extrasDiv.innerHTML = htmlCompletoExtras;

extrasCache = {
extras: htmlCompletoExtras,
moon: ""
};
extrasLastFetch = now;

} catch (e) {
console.error("Erro ao obter dados adicionais:", e);
extrasDiv.innerHTML = `
<p style="color:#ffcfcf; text-align:center;">
Erro ao carregar extras. Tentando novamente...
</p>
`;

moonDiv.innerHTML = `
<p style="color:#ffcfcf; text-align:center;">
Erro ao carregar fase da lua. Tentando novamente...
</p>
`;
}
}

function getMoonInfo(moonPhase, moonIllumination) {
const phase = moonPhase.toLowerCase();
let illumination = parseFloat(moonIllumination);

if (isNaN(illumination) || illumination < 0) {
illumination = 0;
}

const formattedIllumination = illumination.toFixed(1);

if (illumination < 1 && phase.includes('waxing')) {
return {
emoji: '🌑',
pt: 'Nova (início da Crescente)',
illumination: `${formattedIllumination}%`
};
}

if (illumination < 3 && phase.includes('waning')) {
return {
emoji: '🌒',
pt: 'Minguante Final',
illumination: `${formattedIllumination}%`
};
}

const phases = {
'new': { emoji: '🌑', pt: 'Nova' },
'waxing crescent': { emoji: '🌒', pt: 'Crescente' },
'first quarter': { emoji: '🌓', pt: 'Quarto Crescente' },
'waxing gibbous': { emoji: '🌔', pt: 'Gibosa Crescente' },
'full': { emoji: '🌕', pt: 'Cheia' },
'waning gibbous': { emoji: '🌖', pt: 'Gibosa Minguante' },
'last quarter': { emoji: '🌗', pt: 'Quarto Minguante' },
'waning crescent': { emoji: '🌘', pt: 'Minguante' }
};

for (const [key, value] of Object.entries(phases)) {
if (phase.includes(key)) {
return {
emoji: value.emoji,
pt: value.pt,
illumination: `${formattedIllumination}%`
};
}
}

return {
emoji: '🌑',
pt: 'Fase desconhecida',
illumination: `${formattedIllumination}%`
};
}

function lerCache(chave) {
try {
const chaveCompleta = `cache_${chave}`;
const item = localStorage.getItem(chaveCompleta);
if (!item) return null;

const registro = JSON.parse(item);

if (typeof registro !== 'object' || registro === null) {
localStorage.removeItem(chaveCompleta);
return null;
}

const { timestamp, expira, dados } = registro;

if (typeof timestamp !== 'number' || typeof expira !== 'number') {
localStorage.removeItem(chaveCompleta);
return null;
}

if ((Date.now() - timestamp) < expira) {
return dados;
} else {
localStorage.removeItem(chaveCompleta);
return null;
}

} catch (e) {
console.warn("Erro ao ler cache localStorage:", e);
return null;
}
}

function iniciarAtualizacaoPeriodica() {
clearInterval(intervaloAtualizacao);
intervaloAtualizacao = setInterval(() => {
buscarPrevisaoPorGeolocalizacao(false);
}, 5 * 60 * 1000);
}

const UPDATE_INTERVAL = 5 * 60 * 1000;
let intervaloAtualizacao = setInterval(() => buscarPrevisaoPorGeolocalizacao(false), UPDATE_INTERVAL);

document.addEventListener('visibilitychange', function() { 
if (document.hidden) { 
clearInterval(intervaloAtualizacao); 
} 
});

window.onload = async function () {
const splashScreen = document.getElementById('splashScreen');
document.body.classList.add('loading');

let splashTimeoutId;
let splashHidden = false;

const hideSplashScreen = () => {
if (splashHidden) return;
splashHidden = true;
if (splashScreen) {
splashScreen.style.opacity = '0';
setTimeout(() => {
splashScreen.style.display = 'none';
document.body.classList.remove('loading');
}, 500);
}
};

const isRunningInApp = () => {
return window.cordova || window.Capacitor || /CrossWalk/i.test(navigator.userAgent);
};

window.addEventListener('offline', () => {
const statusDiv = document.getElementById('status');
if (statusDiv) {
statusDiv.innerHTML = '<p style="color:#ff6f00; font-size: 15px;">Você está offline. Conecte-se à internet para atualizar os dados.</p>';
}
});

window.addEventListener('online', () => {
const statusDiv = document.getElementById('status');
if (statusDiv) {
statusDiv.innerHTML = '<p style="color:#4bc194;">Conexão restaurada. Atualizando dados...</p>';
}
buscarPrevisaoPorGeolocalizacao(false);
});

splashTimeoutId = setTimeout(() => {
const essentialDataLoaded =
weatherCache !== null &&
document.getElementById('weatherResult')?.innerHTML.includes('big-icon') &&
document.getElementById('locationDate')?.innerHTML.trim() !== '';

if (!essentialDataLoaded) {
console.warn('Splash travado – tempo esgotado, forçando fechamento.');
hideSplashScreen();
mostrarErroSplash('Não foi possível carregar os dados essenciais. Verifique sua conexão e tente novamente.');
} else {
hideSplashScreen();
}
}, SPLASH_TIMEOUT);

try {
await carregarTudo(true);
iniciarAtualizacaoPeriodica();
hideSplashScreen();
clearTimeout(splashTimeoutId);
} catch (error) {
console.error("Erro no carregamento:", error);
hideSplashScreen();
clearTimeout(splashTimeoutId);
if (!isRunningInApp()) {
reiniciarBuscaAutomatica();
}
}
};

async function carregarTudo(isInitialLoad = true) {
try {
const statusDiv = document.getElementById('status');
statusDiv.innerHTML = `
<p style="color: #ccc; font-size: 0.85em;">Buscando dados do tempo...</p>
<div class="progress-bar-small">
<div class="progress"></div>
</div>
`;
await buscarPrevisaoPorGeolocalizacao(isInitialLoad);
} catch (erro) {
console.error("Erro ao carregar dados:", erro);
}
}