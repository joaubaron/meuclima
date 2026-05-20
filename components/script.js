const API_BASE = 'https://meu-projeto-clima.vercel.app/api/weather';
const CACHE_PREFIX = 'cache_';
const UPDATE_INTERVAL = 5 * 60 * 1000;
const SPLASH_TIMEOUT = 30000;
const GEO_TIMEOUT = 20000;
const NOMINATIM_USER_AGENT = 'MeuClima/1.0 (local testing)';
let splashTimeoutId = null;
const DOM_IDS = {
WEATHER_RESULT: 'weatherResult',
STATUS: 'status',
SPLASH_SCREEN: 'splashScreen',
PULL_TO_REFRESH: 'pullToRefresh',
MOON_INFO: 'moonInfo',
EXTRAS: 'extras',
LOCATION_DATE: 'locationDate',
WEATHER_MESSAGE: 'weatherMessage',
ESTACAO_INFO: 'estacaoInfo',
NOTIFICACAO_ALERTA: 'notificacaoAlerta',
SUGESTAO_RECEITA: 'sugestaoReceita',
TELA_GRAFICOS: 'telaGraficos',
TELA_ESCALAS: 'telaEscalas',
TEMPERATURA_CHART: 'temperaturaChart',
PRECIPITACAO_CHART: 'precipitacaoChart',
VENTO_CHART: 'ventoChart'
};

const STYLES = {
ERROR_BOX: 'color:#ff6f00;text-align:center;padding:20px;',
SUCCESS_TEXT: 'color:#4bc194;',
WARNING_TEXT: 'color:#ccc;font-size:0.75em;',
VALUE_TEXT: 'color:#ffeb3b;'
};

const UI_STATE = {
touchStartY: 0,
isPulling: false,
isRefreshing: false,
currentTemperatureMessage: '',
weatherCache: null,
extrasCache: { extras: "", moon: "" }
};

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

function reiniciarBuscaAutomatica() {
setTimeout(() => buscarPrevisaoPorGeolocalizacao(false), 5000);
}

function reiniciarBusca() {
buscarPrevisaoPorGeolocalizacao(false);
}
document.addEventListener('touchstart', function (e) {
if (window.scrollY === 0) {
UI_STATE.touchStartY = e.touches[0].clientY;
UI_STATE.isPulling = true;
}
}, { passive: true });

document.addEventListener('touchmove', function (e) {
if (!UI_STATE.isPulling || UI_STATE.isRefreshing) return;

const touchY = e.touches[0].clientY;
const distance = touchY - UI_STATE.touchStartY;

const refreshDiv = document.getElementById(DOM_IDS.PULL_TO_REFRESH);

if (distance > 50) {
refreshDiv.style.opacity = '1';
} else {
refreshDiv.style.opacity = '0';
}
}, { passive: true });

document.addEventListener('touchend', function (e) {
if (!UI_STATE.isPulling || UI_STATE.isRefreshing) return;

const touchEndY = e.changedTouches[0].clientY;
const distance = touchEndY - UI_STATE.touchStartY;
const refreshDiv = document.getElementById(DOM_IDS.PULL_TO_REFRESH);

if (distance > 80) {
UI_STATE.isRefreshing = true;
refreshDiv.style.opacity = '1';

atualizarDados().then(() => {
setTimeout(() => {
refreshDiv.style.opacity = '0';
UI_STATE.isRefreshing = false;
}, 800);
});
} else {
refreshDiv.style.opacity = '0';
}

UI_STATE.isPulling = false;
}, { passive: true });

async function atualizarDados() {
console.log('Atualizando dados...');
location.reload();
}

// NOVA FUNÇÃO: Sistema de mensagens amigáveis de erro
function mostrarMensagemAmigavel(tipoErro, detalhes = {}) {
const resultDiv = document.getElementById(DOM_IDS.WEATHER_RESULT);
const statusDiv = document.getElementById(DOM_IDS.STATUS);

const mensagensErro = {
'sem-internet': {
titulo: '🔌 Sem conexão',
mensagem: 'Parece que você está offline no momento.',
sugestao: 'Conecte-se à internet e tente novamente.',
cor: '#ff9800',
icone: '🌐'
},
'gps-off': {
titulo: '📍 GPS desativado',
mensagem: 'Precisamos da sua localização para mostrar o clima.',
sugestao: 'Ative o GPS e recarregue a página.',
cor: '#ff5722',
icone: '📍'
},
'permissao-negada': {
titulo: '🙅 Permissão negada',
mensagem: 'Você não permitiu o acesso à localização.',
sugestao: 'Libere o acesso nas configurações do seu dispositivo.',
cor: '#f44336',
icone: '🔒'
},
'timeout': {
titulo: '⏰ Demorou demais',
mensagem: 'O serviço de localização está demorando para responder.',
sugestao: 'Verifique se está em uma área com bom sinal de GPS.',
cor: '#ff9800',
icone: '🕐'
},
'api-falhou': {
titulo: '🌧️ Serviço indisponível',
mensagem: 'Nosso serviço de meteorologia está instável.',
sugestao: 'Tente novamente em alguns instantes.',
cor: '#9c27b0',
icone: '☁️'
},
'dados-antigos': {
titulo: '📊 Dados desatualizados',
mensagem: 'Não foi possível obter informações recentes.',
sugestao: 'Usando dados de até 24 horas atrás.',
cor: '#ffc107',
icone: '⚠️'
},
'erro-desconhecido': {
titulo: '🤔 Ops! Algo inesperado',
mensagem: 'Ocorreu um erro que não esperávamos.',
sugestao: 'Tente novamente ou entre em contato com o suporte.',
cor: '#e91e63',
icone: '🔧'
}
};

const erro = mensagensErro[tipoErro] || mensagensErro['erro-desconhecido'];

const htmlAmigavel = `
<div style="
background: linear-gradient(135deg, ${erro.cor}20 0%, ${erro.cor}10 100%);
border-radius: 20px;
padding: 30px 20px;
text-align: center;
margin: 20px;
animation: slideIn 0.5s ease-out;
">
<div style="font-size: 64px; margin-bottom: 20px;">${erro.icone}</div>
<h3 style="color: ${erro.cor}; margin-bottom: 10px;">${erro.titulo}</h3>
<p style="color: #fff; margin-bottom: 15px;">${erro.mensagem}</p>
<p style="color: ${erro.cor}99; font-size: 0.9em;">💡 ${erro.sugestao}</p>

<div style="margin-top: 25px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
<button onclick="reiniciarBuscaComRetry()" style="
background: ${erro.cor};
color: white;
border: none;
padding: 12px 24px;
border-radius: 30px;
font-size: 14px;
font-weight: bold;
cursor: pointer;
transition: transform 0.2s;
" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
🔄 Tentar novamente
</button>

<button onclick="abrirConfiguracoes()" style="
background: rgba(255,255,255,0.2);
color: white;
border: 1px solid ${erro.cor};
padding: 12px 24px;
border-radius: 30px;
font-size: 14px;
cursor: pointer;
transition: all 0.2s;
" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
⚙️ Verificar configurações
</button>
</div>

<div style="margin-top: 20px; font-size: 12px; color: rgba(255,255,255,0.5);">
Código do erro: ${tipoErro}
</div>
</div>
`;

if (!document.querySelector('#error-animation-style')) {
const style = document.createElement('style');
style.id = 'error-animation-style';
style.textContent = `
@keyframes slideIn {
from { opacity: 0; transform: translateY(20px); }
to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
0%, 100% { opacity: 1; }
50% { opacity: 0.5; }
}
`;
document.head.appendChild(style);
}

if (resultDiv) resultDiv.innerHTML = htmlAmigavel;
if (statusDiv) statusDiv.innerHTML = '';
}

// NOVA FUNÇÃO: Abrir configurações do dispositivo
function abrirConfiguracoes() {
if (window.webkit && window.webkit.messageHandlers && window.cordova) {
cordova.plugins.settings.openSettings();
}

if (navigator.userAgent.match(/Android/i)) {
window.location.href = 'app-settings:';
}

mostrarDicasManuais();
}

// NOVA FUNÇÃO: Mostrar dicas manuais
function mostrarDicasManuais() {
const modal = document.createElement('div');
modal.style.cssText = `
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background: rgba(0,0,0,0.95);
z-index: 30000;
display: flex;
align-items: center;
justify-content: center;
padding: 20px;
`;

modal.innerHTML = `
<div style="background: linear-gradient(135deg, #002244 0%, #001133 100%); border-radius: 20px; padding: 25px; max-width: 300px; text-align: center;">
<div style="font-size: 50px;">📱</div>
<h3 style="color: #ffeb3b;">Dicas rápidas</h3>
<ul style="text-align: left; color: #fff; margin: 20px 0;">
<li>✓ Verifique se o GPS está ativo</li>
<li>✓ Conecte-se à internet</li>
<li>✓ Permita acesso à localização</li>
<li>✓ Reinicie o aplicativo</li>
</ul>
<button onclick="this.parentElement.parentElement.remove()" style="background: #ffeb3b; border: none; padding: 10px 20px; border-radius: 20px; font-weight: bold; cursor: pointer;">Entendi! 👍</button>
</div>
`;

document.body.appendChild(modal);
}

// SUBSTITUIR a função mostrarMensagemErro existente
function mostrarMensagemErro(mensagem, tipoErro = 'erro-desconhecido') {
console.log(`Erro: ${tipoErro} - ${mensagem}`);

if (mensagem.includes('Sem conexão') || mensagem.includes('offline')) {
tipoErro = 'sem-internet';
} else if (mensagem.includes('Permissão negada')) {
tipoErro = 'permissao-negada';
} else if (mensagem.includes('GPS') || mensagem.includes('localização')) {
tipoErro = 'gps-off';
} else if (mensagem.includes('Timeout') || mensagem.includes('demorou')) {
tipoErro = 'timeout';
} else if (mensagem.includes('API') || mensagem.includes('servidor')) {
tipoErro = 'api-falhou';
}

mostrarMensagemAmigavel(tipoErro);
}

// NOVA FUNÇÃO: Notificação toast amigável
function mostrarToast(mensagem, tipo = 'info') {
const toast = document.createElement('div');
const cores = {
sucesso: '#4caf50',
erro: '#f44336',
info: '#2196f3',
alerta: '#ff9800'
};

toast.style.cssText = `
position: fixed;
bottom: 20px;
left: 50%;
transform: translateX(-50%);
background: ${cores[tipo] || cores.info};
color: white;
padding: 12px 24px;
border-radius: 30px;
font-size: 14px;
z-index: 40000;
animation: slideUp 0.3s ease-out;
box-shadow: 0 4px 12px rgba(0,0,0,0.3);
max-width: 80%;
text-align: center;
`;

toast.textContent = mensagem;
document.body.appendChild(toast);

setTimeout(() => {
toast.style.animation = 'slideDown 0.3s ease-out';
setTimeout(() => toast.remove(), 300);
}, 3000);
}

// Adicionar animações CSS para toast
const toastStyle = document.createElement('style');
toastStyle.textContent = `
@keyframes slideUp {
from { opacity: 0; transform: translateX(-50%) translateY(20px); }
to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes slideDown {
from { opacity: 1; transform: translateX(-50%) translateY(0); }
to { opacity: 0; transform: translateX(-50%) translateY(20px); }
}
`;
document.head.appendChild(toastStyle);

// NOVA FUNÇÃO: Recuperação automática inteligente
let tentativasRecuperacao = 0;
function recuperacaoInteligente() {
tentativasRecuperacao++;

if (tentativasRecuperacao <= 3) {
mostrarToast(`🔄 Tentativa ${tentativasRecuperacao} de recuperação...`, 'info');

setTimeout(() => {
if (navigator.onLine) {
buscarPrevisaoPorGeolocalizacao(false);
} else {
window.addEventListener('online', function onOnline() {
window.removeEventListener('online', onOnline);
buscarPrevisaoPorGeolocalizacao(false);
});
}
}, tentativasRecuperacao * 2000);
} else {
mostrarMensagemAmigavel('erro-desconhecido');
mostrarToast('❌ Não foi possível recuperar automaticamente', 'erro');
tentativasRecuperacao = 0;
}
}

function limparCachePorPrioridade() {
const itens = [];

for (let i = 0; i < localStorage.length; i++) {
const chave = localStorage.key(i);
if (chave.startsWith(CACHE_PREFIX)) {
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
const itensCache = [];

for (let i = 0; i < localStorage.length; i++) {
const chave = localStorage.key(i);
if (chave && chave.startsWith(CACHE_PREFIX)) {
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
const chaveCompleta = `${CACHE_PREFIX}${chave}`;
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
UI_STATE.isRefreshing = false;
const pullElement = document.getElementById('pullToRefresh');
if (pullElement) {
pullElement.style.transform = 'translateY(0)';
pullElement.style.transition = 'transform 0.3s ease';
}
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

// Parte 1 — temperatura: declaração limpa, sem pontuação final
const sugestoesTemp = {
frio: [
"Tá bem frio lá fora",
"Faz frio hoje",
"Temperatura baixa",
"Dia gelado",
"Friozinho forte hoje"
],
fresco: [
"Está fresquinho",
"Clima ameno hoje",
"Temperatura agradável",
"Dia de meia estação",
"Fresquinho gostoso"
],
agradável: [
"Clima ótimo hoje",
"Temperatura ideal",
"Dia perfeito pra sair",
"Clima muito agradável",
"Temperatura gostosa"
],
calor: [
"Está quente hoje",
"Calor moderado lá fora",
"Temperatura elevada",
"Dia quente",
"Bastante calor hoje"
],
muitoCalor: [
"Calor intenso hoje",
"Temperatura muito alta",
"Dia de muito calor",
"Calorão lá fora",
"Faz muito calor"
]
};

// Parte 2 — chuva: contexto + conselho, minúsculo para encaixar após vírgula
const sugestoesChuva = {
garoa: [
"pode cair uma garoa, leve o guarda-chuva",
"chuvisco possível, se previna",
"garoa leve no radar, fique atento",
"pode pescumicar, melhor se preparar",
"leve uma capa só por garantia"
],
fraca: [
"chuva fraca prevista, vale levar o guarda-chuva",
"chuva leve no caminho, se proteja",
"chuvinha fraca, mas leve cobertura",
"pequena chance de chuva, se previna",
"chuva fina esperada, fique ligado"
],
moderada: [
"chuva moderada prevista, não esqueça o guarda-chuva",
"vai chover com força moderada, se prepare",
"chuva moderada no radar, fique esperto",
"previsão de chuva razoável, leve proteção",
"chuva moderada vindo aí, atenção"
],
forte: [
"chuva forte prevista, cuidado ao sair",
"chuva pesada no radar, se proteja bem",
"vai chover bastante, planeje com cuidado",
"chuva intensa esperada, evite se molhar",
"tempestade no caminho, se cuide"
],
intensa: [
"chuva torrencial prevista, fique em casa se puder",
"chuva muito intensa no radar, evite sair",
"risco alto de alagamento, muita atenção",
"tempestade forte esperada, segurança em primeiro lugar",
"chuva extrema prevista, não arrisque"
],
semChuva: [
"sem chuva prevista",
"céu aberto o dia todo",
"tempo seco e estável",
"sem previsão de chuva",
"dia sem chuva"
]
};

// Parte 3a — vento sem chuva: já traz o finalizador embutido
const sugestoesVento = {
calminho: [
"e vento calmo. Aproveite o dia!",
"e sem vento. Tenha um ótimo dia!",
"com tempo estável. Curta bastante!",
"e clima bem parado. Dia bom!",
"e ventinho quase zero. Ótimo dia!"
],
brisaLeve: [
"com brisa leve. Dia agradável!",
"e uma brisa suave. Aproveite!",
"e vento leve soprando. Bom dia!",
"com ventinho gostoso. Curta!",
"e brisa refrescante. Ótimo dia!"
],
moderado: [
"e vento moderado. Fique ligado!",
"com ventania leve. Atenção ao sair!",
"e vento presente. Segure o chapéu!",
"com vento médio. Bom dia mesmo assim!",
"e clima ventoso. Cuide-se!"
],
forte: [
"e vento forte. Cuidado ao sair!",
"com ventania forte. Evite áreas abertas!",
"e rajadas de vento. Fique atento!",
"com vento intenso. Se proteja!",
"e vento potente. Redobre a atenção!"
],
muitoForte: [
"e vendaval lá fora. Evite sair!",
"com vento muito forte. Fique em casa se puder!",
"e ventos perigosos. Muita atenção!",
"com rajadas intensas. Não arrisque!",
"e vento extremo. Segurança em primeiro lugar!"
]
};

// Parte 3b — vento com chuva: segunda sentença autônoma
const sugestoesVentoComChuva = {
calminho: [
"O vento está calmo, ao menos.",
"Sem vento forte, só a chuva mesmo.",
"Vento tranquilo acompanhando a chuva.",
"O vento não preocupa, mas a chuva sim.",
"Sem agravante de vento, fique atento à chuva."
],
brisaLeve: [
"O vento está leve, mas a chuva pede atenção.",
"Brisa suave junto com a chuva.",
"Ventinho leve acompanhando a chuva.",
"Brisa fraca, chuva no radar.",
"Vento leve e chuva juntos, se proteja."
],
moderado: [
"Vento moderado junto com a chuva, dobre a atenção.",
"Clima instável com chuva e vento.",
"Vento e chuva combinados, fique esperto.",
"Ventania leve e chuva no caminho.",
"Chuva e vento médio, se prepare bem."
],
forte: [
"Vento forte e chuva juntos, muito cuidado.",
"Combinação de ventania e chuva. Fique em segurança.",
"Chuva pesada com vento forte. Evite sair.",
"Clima severo: chuva e vento intensos.",
"Rajadas fortes e chuva. Redobre a atenção."
],
muitoForte: [
"Vento fortíssimo e chuva intensa. Não saia!",
"Tempestade com vento extremo. Fique em casa!",
"Risco alto: vento e chuva perigosos.",
"Condições severas de vento e chuva. Segurança primeiro!",
"Vendaval com chuva torrencial. Não arrisque!"
]
};

function pegarAleatorio(lista) {
return lista[Math.floor(Math.random() * lista.length)];
}

// Temperatura
let chaveTemp = faixaTemp === "muito calor" ? "muitoCalor" : faixaTemp;
let parteTemp = pegarAleatorio(sugestoesTemp[chaveTemp] || ["Clima desconhecido"]);

// Chuva
let chaveChuva = "semChuva";
if (precip_mm > 0.2) {
if (precip_mm <= 1)       chaveChuva = "garoa";
else if (precip_mm <= 4)  chaveChuva = "fraca";
else if (precip_mm <= 10) chaveChuva = "moderada";
else if (precip_mm <= 20) chaveChuva = "forte";
else                      chaveChuva = "intensa";
}
let parteChuva = pegarAleatorio(sugestoesChuva[chaveChuva]).trim();

// Vento
const temChuva = chaveChuva !== "semChuva";
let chaveVento = "calminho";
if (wind_kph > 10 && wind_kph <= 20) chaveVento = "brisaLeve";
else if (wind_kph <= 30)             chaveVento = "moderado";
else if (wind_kph <= 45)             chaveVento = "forte";
else if (wind_kph > 45)             chaveVento = "muitoForte";

// Montar frase
// Sem chuva: "Temperatura, chuva, vento descritivo. Finalizador!"
// Com chuva:  "Temperatura, chuva. Vento+chuva autônomo."
let frase;
if (!temChuva) {
// Separa "parte descritiva. Finalizador!" para capitalizar corretamente
const ventoRaw = pegarAleatorio(sugestoesVento[chaveVento]).trim();
const pontoIdx = ventoRaw.indexOf('. ');
let ventoDesc, ventoFinal;
if (pontoIdx !== -1) {
ventoDesc  = ventoRaw.slice(0, pontoIdx).toLowerCase();
ventoFinal = ventoRaw.slice(pontoIdx + 2); // já começa com maiúscula
} else {
ventoDesc  = ventoRaw.toLowerCase();
ventoFinal = '';
}
frase = `${parteTemp}, ${parteChuva.toLowerCase()}, ${ventoDesc}.`;
if (ventoFinal) frase += ` ${ventoFinal}`;
frase = frase.charAt(0).toUpperCase() + frase.slice(1);
} else {
const parteVento = pegarAleatorio(sugestoesVentoComChuva[chaveVento]).trim();
frase = `${parteTemp}, ${parteChuva.toLowerCase()}. ${parteVento}`;
frase = frase.charAt(0).toUpperCase() + frase.slice(1);
}

return frase;
}

function getPreciseSeasonDates(year) {
return {
OUTONO:    { date: new Date(year, 2, 20, 12, 0, 0), emoji: "🍂" },    // 20 março
INVERNO:   { date: new Date(year, 5, 20, 12, 0, 0), emoji: "❄️" },    // 20 junho
PRIMAVERA: { date: new Date(year, 8, 22, 12, 0, 0), emoji: "🌸" },    // 22 setembro
VERÃO:     { date: new Date(year, 11, 21, 12, 0, 0), emoji: "☀️" }    // 21 dezembro
};
}

function getCurrentSeason(date = new Date()) {
const year = date.getFullYear();
const seasons = getPreciseSeasonDates(year);
const outonoAnterior = getPreciseSeasonDates(year - 1).OUTONO.date;

if (date >= outonoAnterior && date < seasons.INVERNO.date) return "OUTONO";
if (date >= seasons.INVERNO.date && date < seasons.PRIMAVERA.date) return "INVERNO";
if (date >= seasons.PRIMAVERA.date && date < seasons.VERÃO.date) return "PRIMAVERA";
return "VERÃO";
}

function getSeasonDates(season, year = new Date().getFullYear()) {
const seasonDates = getPreciseSeasonDates(year);
const seasonsOrder = ["OUTONO", "INVERNO", "PRIMAVERA", "VERÃO"];
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
end: endDate,
emoji: seasonDates[season].emoji,
next: nextSeason
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
<div style="text-align:center; font-size:0.80rem; line-height:1.4; margin-bottom:4px;">
<span style="margin-right:5px;">${emoji}</span>
${capitalize(estacao)} está aí e vai até ${formatarDataLonga(end)}
</div>
<div style="text-align:center; font-size:0.80rem; line-height:1.4;">
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
history.pushState({modal: 'Graficos'}, '');
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
history.pushState({modal: 'Escalas'}, '');
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

UI_STATE.isRefreshing = false;
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

function mapearFaixa(valor, faixas) {
for (const faixa of faixas) {
if (valor >= faixa.min && valor <= faixa.max) return faixa.label;
}
return faixas[faixas.length - 1].label;
}

const FAIXAS_PRECIPITACAO = [
{ min: 0, max: 0.2, label: "Sem chuva" },
{ min: 0.2, max: 1, label: "Garoa leve" },
{ min: 1, max: 4, label: "Chuva fraca" },
{ min: 4, max: 10, label: "Moderada" },
{ min: 10, max: 20, label: "Chuva forte" },
{ min: 20, max: 50, label: "Muito forte" },
{ min: 50, max: Infinity, label: "Chuva extrema" }
];

const FAIXAS_VENTO = [
{ min: 0, max: 1, label: "Sem vento" },
{ min: 1, max: 9, label: "Brisinha leve" },
{ min: 9, max: 30, label: "Vento moderado" },
{ min: 30, max: 49, label: "Ventania" },
{ min: 49, max: 74, label: "Quase voando" },
{ min: 74, max: 102, label: "Muito forte" },
{ min: 102, max: Infinity, label: "Destrutivo" }
];

function getDescricaoPrecipitacao(mm) {
return mapearFaixa(mm, FAIXAS_PRECIPITACAO);
}

function getDescricaoVento(kph) {
return mapearFaixa(kph, FAIXAS_VENTO);
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

async function carregarGraficos() {
if (!UI_STATE.weatherCache) {
console.log("Aguardando dados do tempo…");
return;
}

if (typeof Chart === "undefined") {
console.error('Chart.js não está carregado!');
return;
}

destruirGraficos();

const forecast = UI_STATE.weatherCache.forecast;
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
label: `🌧️ Média ${mediaPrecip24h.toFixed(1)} mm – ${descricaoPrecip}`,
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
label: `🍃 Média ${mediaVento24h.toFixed(1)} km/h – ${descricaoVento}`,
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
sugestaoDiv.style.fontSize = '12px';
sugestaoDiv.style.textAlign = 'left';
sugestaoDiv.style.lineHeight = '1.4';
sugestaoDiv.innerHTML = `<strong style="color: #ffeb3b;">Clima:</strong> ${sugestaoVestuario}`;

const ultimoGrafico = document.querySelector('.grafico:last-child');
if (ultimoGrafico && ultimoGrafico.parentNode) {
ultimoGrafico.parentNode.appendChild(sugestaoDiv);
}
}

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
'1-1'  : `Feliz Ano Novo! Que ${anoAtual} seja incrível!`,
'28-1' : `É aniversário da Bruna! 🎂`,
'30-1' : `Marlon está completando ${anoAtual - 1988} anos hoje! 🎉`,
'7-2'  : `Parabéns, Clara! Hoje ela faz ${anoAtual - 2016} anos! 🎈`,
'12-2' : `É aniversário do Sérgio — ele celebra ${anoAtual - 1969} anos! 🎊`,
'5-3'  : 'Feliz aniversário, Baron! 🥳',
'9-3'  : 'Hoje é aniversário do seu pai! 🎁',
'23-3' : `Eduardo completa hoje ${anoAtual - 2003} anos! 🎂`,
'5-4'  : 'Hoje marca o dia em que você conheceu a Cláudia. 💛',
'2-5'  : `Mateus está festejando ${anoAtual - 2001} anos! 🎉`,
'5-6'  : 'Você e a Cláudia começaram a dividir a vida. 💞',
'12-6' : 'Feliz Dia dos Namorados! 💕',
'5-7'  : `Débora está de aniversário, são ${anoAtual - 1973} anos! 🎂`,
'5-9'  : 'Aniversário da Cláudia! Que tal algo especial? 🍷',
'23-10': 'Hoje é aniversário da sua mãe. 🌹',
'3-11' : 'Juntos e fortes! Que tal levar um bom vinho? 🍷',
'25-11': `Morgama comemora ${anoAtual - 1984} anos hoje! 🎈`,
'25-12': 'Que este feriado traga muita paz. ✨'
};

const chave1 = `${dia}-${mes}`;
const chave2 = `${dia.toString().padStart(2,'0')}-${mes}`;

return mensagensEspeciais[chave1] || mensagensEspeciais[chave2] || null;
}

function getTodayMinMaxTemp(weatherData) {
try {
const today = weatherData.forecast.forecast.forecastday[0];
if (today && today.day) {
return {
min: today.day.mintemp_c,
max: today.day.maxtemp_c
};
}
} catch (e) {
console.warn('Erro ao obter min/max do dia:', e);
}
return { min: null, max: null };
}

function getMessageForTemperature(temp, isInitialLoad = false) {
const especialHoje = getSpecialDateMessage();
if (especialHoje) {
UI_STATE.currentTemperatureMessage = especialHoje;
return UI_STATE.currentTemperatureMessage;
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
UI_STATE.currentTemperatureMessage = `${emoji} ${group.messages[randomIndex]}`;
} else {
UI_STATE.currentTemperatureMessage = 'Aproveite o dia!';
}
}

return UI_STATE.currentTemperatureMessage;
}

function atualizarMensagemTemperatura(weatherData = null) {
const messageDiv = document.getElementById(DOM_IDS.WEATHER_MESSAGE);
if (!messageDiv) return;

let minMaxHtml = '';

if (weatherData) {
const { min, max } = getTodayMinMaxTemp(weatherData);
if (min !== null && max !== null) {
minMaxHtml = ` Hoje entre ${min.toFixed(0)}° e ${max.toFixed(0)}°`;
}
}

let mensagemOriginal = UI_STATE.currentTemperatureMessage;

// Remove APENAS o PRIMEIRO emoji da string
// Isso captura qualquer emoji no início (incluindo os com variação como 🌤️)
const primeiroEmojiMatch = mensagemOriginal.match(/^[\p{Emoji}\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s?/u);

let mensagemSemPrimeiroEmoji = mensagemOriginal;
if (primeiroEmojiMatch) {
mensagemSemPrimeiroEmoji = mensagemOriginal.replace(primeiroEmojiMatch[0], '').trim();
}

// Agora aplica as regras de pontuação na mensagem restante
// Remove qualquer exclamação/interrogação/ponto do final do texto
let texto = mensagemSemPrimeiroEmoji.replace(/[!?.]+$/, '');

// Garante que tenha exclamação
if (!texto.includes('!')) {
texto = texto + '!';
}

// Monta mensagem final (sem o primeiro emoji)
const mensagemFinal = texto;

messageDiv.innerHTML = mensagemFinal + minMaxHtml;
}

async function fetchAllWeatherData(lat, lon, forceRefresh = false) {
const now = Date.now();
const cacheKey = `weather_${lat}_${lon}`;

let cachedData = null;

if (!forceRefresh) {
cachedData = lerCache(cacheKey);
if (cachedData) {
UI_STATE.weatherCache = cachedData;

// ✅ ADICIONADO: Usar cache imediato se existir
console.log('⚡ Usando cache imediato para velocidade');
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

UI_STATE.weatherCache = data;
salvarCache(cacheKey, data, 10);

return data;

} catch (error) {
console.error("Erro ao buscar dados:", error.message || error);

if (!cachedData) {
cachedData = lerCache(cacheKey);
}

if (cachedData) {
console.warn("⚠️ Usando dados em cache devido ao erro");
return cachedData;
}

// ✅ ADICIONADO: Retornar dados vazios como fallback
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
`${API_BASE}?cidade=${lat},${lon}&tipo=current`,
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
const response = await fetch(`${API_BASE}?cidade=${lat},${lon}&tipo=forecast&days=${days}`);

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
const response = await fetch(`${API_BASE}?cidade=${lat},${lon}&tipo=astronomy&date=${date}`);
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

if(statusDiv && isInitialLoad) {
statusDiv.innerHTML = `
<p style="color:#ccc;font-size:0.75em;">Buscando dados do tempo…</p>
<div class="progress-bar-small"><div class="progress"></div></div>
`;
}

try {
// 1. PRIMEIRO: Só GPS (rápido)
const position = await new Promise((resolve, reject) => {
const geoTimeout = setTimeout(() => reject(new Error('Timeout geolocalização')), GEO_TIMEOUT);

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

// Usar coordenadas como fallback imediato (não esperar Nominatim)
let cidade = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
let bairro = '';

// Mostra localização básica imediatamente
const dias = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const hoje = new Date();
const dataFormatada = `${dias[hoje.getDay()]}, ${hoje.getDate()} de ${meses[hoje.getMonth()]}`;

if(locationDateDiv) {
locationDateDiv.innerHTML = `${cidade} 🕐 ${dataFormatada}`;
}

// 2. BUSCA DADOS DO CLIMA (prioritário)
const weatherData = await fetchAllWeatherData(lat, lon);

// 3. MOSTRA TELA IMEDIATAMENTE
verificarAlertas(weatherData);

const { current: currentWeather } = weatherData;

const iconCode = currentWeather?.condition?.code ?? 1000;
const isDay = currentWeather?.is_day ?? 1;
const temp_c = currentWeather?.temp_c ?? 0;
const humidity = currentWeather?.humidity ?? 0;
const precip_mm = currentWeather?.precip_mm ?? 0;
const wind_kph = currentWeather?.wind_kph ?? 0;
const feelslike_c = currentWeather?.feelslike_c ?? 0;
const condText = currentWeather?.condition?.text ?? 'Desconhecido';

// Mostrar sugestão de receita em background (não bloqueia)
setTimeout(() => mostrarSugestaoReceita(temp_c), 10);

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
<span class="weather-value" style="color:#ffeb3b;">${precip_mm.toFixed(1)} mm</span>
</div>
<div class="info-item">
<span>🍃</span>
<span class="weather-value" style="color:#ffeb3b;">${wind_kph.toFixed(1)} km/h</span>
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
atualizarMensagemTemperatura(weatherData);
}

if(statusDiv) statusDiv.innerHTML = '';

// 4. DEPOIS: Carrega o resto em BACKGROUND (sem bloquear)
setTimeout(async () => {
try {
// Buscar nome da cidade em background
const nomeCidade = await buscarNomeCidadeBackground(lat, lon);
if (nomeCidade && locationDateDiv) {
locationDateDiv.innerHTML = `${nomeCidade} 🕐 ${dataFormatada}`;
}

// Buscar extras (fase da lua, previsões)
await buscarExtras(lat, lon);
} catch(e) {
console.warn('Erro ao carregar dados extras:', e);
}
}, 100);

} catch (error) {
console.error('Erro ao buscar previsão:', error);

let tipoErro = 'erro-desconhecido';

if (error instanceof GeolocationPositionError) {
switch (error.code) {
case error.PERMISSION_DENIED:
tipoErro = 'permissao-negada';
mostrarMensagemAmigavel(tipoErro);
mostrarToast('📍 Ative a localização nas configurações', 'alerta');
break;
case error.POSITION_UNAVAILABLE:
tipoErro = 'gps-off';
mostrarMensagemAmigavel(tipoErro);
mostrarToast('📡 Sinal de GPS fraco', 'alerta');
break;
case error.TIMEOUT:
tipoErro = 'timeout';
mostrarMensagemAmigavel(tipoErro);
mostrarToast('⏰ Aguardando sinal de GPS', 'info');
break;
default:
mostrarMensagemAmigavel(tipoErro);
}
} else if (error.message === "Sem conexão com a internet") {
tipoErro = 'sem-internet';
mostrarMensagemAmigavel(tipoErro);
mostrarToast('🌐 Conecte-se à internet', 'alerta');
} else if (error.message.includes("HTTP error") || error.message.includes("API")) {
tipoErro = 'api-falhou';
mostrarMensagemAmigavel(tipoErro);
mostrarToast('☁️ Serviço temporariamente indisponível', 'info');
} else {
mostrarMensagemAmigavel(tipoErro);
mostrarToast('🤔 Ops! Algo deu errado', 'erro');
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

// NOVA FUNÇÃO AUXILIAR: Buscar nome da cidade em background
async function buscarNomeCidadeBackground(lat, lon) {
try {
const NOMINATIM_URL = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=pt-BR`;
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 8000);

const resGeo = await fetch(NOMINATIM_URL, {
headers: { 'User-Agent': NOMINATIM_USER_AGENT },
signal: controller.signal
});

clearTimeout(timeoutId);

if (!resGeo.ok) throw new Error(`HTTP ${resGeo.status}`);

const dataGeo = await resGeo.json();
const bairro = dataGeo.address?.suburb ?? dataGeo.address?.neighbourhood ?? '';
const cidade = dataGeo.address?.city ?? dataGeo.address?.town ?? dataGeo.address?.state ?? '';

if (cidade) {
return bairro ? `${bairro}, ${cidade}` : cidade;
}
} catch (e) {
console.warn('Erro ao buscar nome da cidade:', e);
}
return null;
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

const agora24 = new Date();
const horas24 = [...forecast.forecast.forecastday[0].hour, ...(forecast.forecast.forecastday[1]?.hour || [])]
.filter(h => { const diff = (new Date(h.time) - agora24) / 3.6e6; return diff >= 0 && diff <= 24; });
const medias = {
mediaTemp:   calcularMedia(horas24.map(h => h.temp_c)),
mediaPrecip: calcularMedia(horas24.map(h => h.precip_mm)),
mediaVento:  calcularMedia(horas24.map(h => h.wind_kph))
};
const sugestaoVestuario = gerarSugestaoVestuario(
medias.mediaTemp,
medias.mediaPrecip,
medias.mediaVento
);

const sugestaoDiv = document.createElement('div');
sugestaoDiv.style.marginTop = '1px';
sugestaoDiv.style.padding = '10px';
sugestaoDiv.style.borderRadius = '8px';
sugestaoDiv.style.fontSize = '12px';
sugestaoDiv.style.textAlign = 'center';
sugestaoDiv.style.lineHeight = '1.4';
sugestaoDiv.innerHTML = `<strong style="color: #ffeb3b;">Clima:</strong> ${sugestaoVestuario}`;

moonDiv.innerHTML = '';
moonDiv.appendChild(sugestaoDiv);

setTimeout(() => {
const moonInfo = getMoonInfo(astronomy.moon_phase, astronomy.moon_illumination);
const iluminacaoValor = parseFloat(astronomy.moon_illumination.toFixed(1));

const moonHTML = `
<div class="info-inline moon-text" style="font-size: 1.2em; overflow-x: auto;">
<div class="info-item" style="display: flex; align-items: center; flex-wrap: nowrap; gap: 15px; white-space: nowrap;">
<span>
<a href="#"
onclick="abrirStarWalkMoon(); return false;"
style="color: inherit; text-decoration: none; cursor: pointer; -webkit-tap-highlight-color: transparent;">
Lua <span class="moon-emoji">${moonInfo.emoji}</span> ${moonInfo.pt} em ${iluminacaoValor}% <span style="font-size: 0.70em; color: #ffeb3b;">de brilho</span>
</a>
</span>
</div>
</div>
`;

moonDiv.innerHTML = moonHTML;
UI_STATE.extrasCache.moon = moonHTML;
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

UI_STATE.extrasCache = {
extras: htmlCompletoExtras,
moon: ""
};
UI_STATE.extrasLastFetch = now;

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
'waxing crescent': { emoji: '🌘', pt: 'Crescente' },
'first quarter': { emoji: '🌓', pt: 'Quarto Crescente' },
'waxing gibbous': { emoji: '🌔', pt: 'Gibosa Crescente' },
'full': { emoji: '🌕', pt: 'Cheia' },
'waning gibbous': { emoji: '🌖', pt: 'Gibosa Minguante' },
'last quarter': { emoji: '🌗', pt: 'Quarto Minguante' },
'waning crescent': { emoji: '🌒', pt: 'Minguante' }
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
const chaveCompleta = `${CACHE_PREFIX}${chave}`;
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

let intervaloAtualizacao = setInterval(() => buscarPrevisaoPorGeolocalizacao(false), UPDATE_INTERVAL);

document.addEventListener('visibilitychange', function() {
if (document.hidden) {
clearInterval(intervaloAtualizacao);
}
});

window.onload = async function () {
const splashScreen = document.getElementById('splashScreen');
document.body.classList.add('loading');
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
UI_STATE.weatherCache !== null &&
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

function abrirStarWalkMoon() {
const modal = document.createElement('div');
modal.id = 'modalStarWalk';
modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000000;z-index:20000;display:flex;flex-direction:column;';

history.pushState({modal: 'StarWalk'}, '');

const header = document.createElement('div');
header.style.cssText = 'display:flex;justify-content:flex-end;padding:12px;background:#0a0a1a;';

const closeBtn = document.createElement('button');
closeBtn.textContent = 'Fechar';
closeBtn.style.cssText = 'background:transparent;border:none;color:#ffeb3b;font-size:14px;font-weight:bold;cursor:pointer;padding:12px 20px;';
closeBtn.onclick = () => {
document.body.removeChild(modal);
if (history.state && history.state.modal === 'StarWalk') {
history.back();
}
};

header.appendChild(closeBtn);

const iframe = document.createElement('iframe');
iframe.src = 'https://starwalk.space/pt/moon-calendar';
iframe.style.cssText = 'width:100%;flex:1;border:none;background:#fff;';

modal.appendChild(header);
modal.appendChild(iframe);
document.body.appendChild(modal);
}

window.addEventListener('popstate', function(event) {
const modalGraficos = document.getElementById('telaGraficos');
const modalEscalas = document.getElementById('telaEscalas');
const modalStarWalk = document.getElementById('modalStarWalk');

if (modalGraficos && modalGraficos.style.display === 'block') {
fecharModal('Graficos');
event.preventDefault();
event.stopPropagation();
} else if (modalEscalas && modalEscalas.style.display === 'block') {
fecharModal('Escalas');
event.preventDefault();
event.stopPropagation();
} else if (modalStarWalk) {
document.body.removeChild(modalStarWalk);
event.preventDefault();
event.stopPropagation();
}
});
