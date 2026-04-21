# Tasarım ve Mimari (Design & Architecture)

> Diller: [English](./DESIGN.md) · **Türkçe**

Bu belge, **estate-comission-app** projesi geliştirilirken arka planda alınan mimari ve teknik kararların nedenlerini açıklamaktadır. "Bu kod ne yapıyor?" sorusundan ziyade "Bu sistem neden bu şekilde kurgulandı?" sorusuna yanıt vermeyi hedefler ve doğrudan kaynak kodlarla birlikte okunması tavsiye edilir.

## İçindekiler

1. [Sisteme Genel Bakış](#1-sisteme-genel-bakiş)
2. [Teknoloji Seçimleri](#2-teknoloji-seçimleri)
3. [Alan Modeli (Domain Model)](#3-alan-modeli-domain-model)
4. [Komisyon Kuralları](#4-komisyon-kurallari)
5. [Aşama Durum Makinesi (State Machine)](#5-aşama-durum-makinesi-state-machine)
6. [Eşzamanlılık ve Atomik İşlemler (Concurrency & Atomic Updates)](#6-eşzamanlilik-ve-atomik-işlemler-concurrency--atomic-updates)
7. [Kimlik Doğrulama ve Yetkilendirme](#7-kimlik-doğrulama-ve-yetkilendirme)
8. [API Tasarımı](#8-api-tasarimi)
9. [Backend Modül Düzeni](#9-backend-modül-düzeni)
10. [Frontend Mimarisi](#10-frontend-mimarisi)
11. [Durum Yönetimi (State Management) Stratejisi](#11-durum-yönetimi-state-management-stratejisi)
12. [Kullanıcı Arayüzü ve Deneyimi (UI/UX) Kararları](#12-kullanici-arayüzü-ve-deneyimi-uiux-kararlari)
13. [PDF Üretim Süreci](#13-pdf-üretim-süreci)
14. [Güvenlik Yaklaşımı](#14-güvenlik-yaklaşimi)
15. [Gözlemlenebilirlik (Observability) ve Sağlık Denetimi](#15-gözlemlenebilirlik-observability-ve-sağlik-denetimi)
16. [Test Stratejisi](#16-test-stratejisi)
17. [Geliştirici Deneyimi](#17-geliştirici-deneyimi)
18. [Ödünleşimler (Trade-offs) ve Gelecekteki Planlar](#18-ödünleşimler-trade-offs-ve-gelecekteki-planlar)

---

## 1. Sisteme Genel Bakış

Uygulama arka tarafta bir REST API'ye ve ön tarafta tek sayfalık bir uygulamaya (SPA) dayanan, iki katmanlı klasik bir mimariyle tasarlanmıştır:

```text
┌──────────────────┐      HTTPS / JSON      ┌──────────────────┐
│  Nuxt 3 İstemcisi│ ──────────────────────▶│    NestJS API    │
│  (Tarayıcı SPA)  │ ◀──────────────────────│    (Node.js)     │
└──────────────────┘   Authorization: Bearer└─────────┬────────┘
                                                      │ mongoose
                                                      ▼
                                             ┌──────────────────┐
                                             │  MongoDB Atlas   │
                                             └──────────────────┘
```

- Frontend, hiçbir kalıcı iş bilgisi tutmayan tek sayfalık bir Nuxt uygulamasıdır (SPA). İhtiyaç duyduğu verileri dinlediği REST API üzerinden yansıtır ve hız kazanmak adına Pinia depolarında (state) saklar.
- Backend, hiçbir oturum hafızasını (session) saklamayan Node tabanlı bir NestJS uygulamasıdır. Durumlar ve kayıtlar sadece MongoDB ortamında korumaya alınır, uygulamanın aktif hafızasında isteklere verilen geçici bağlamlar haricinde hiçbir veri izi barındırılmaz.
- Doğrulama akışı da benzer temelde durumsuz (stateless) bir mantıkla ilerler: Sisteme tanımlı oturum onayları, Bearer token adı verilen JWT anahtarları üstünden doğrulanır. İhtiyaç sebebiyle gereksiz ve ağırlaştıran oturum depolamalarından kaçınılmıştır.

Kararlaştırılan mimari ayırım ile birlikte operasyonların kontrol altında kalması hedeflenir. Nuxt SPA deneyimde kullanıcı hissini güçlendirirken Nest API bütün bir iş sürecini yönlendirir. En nihayetinde veri sistemi yormadan (load-balancer mimarileri için hızlıca şekle girebilecek statik bir ölçeğe) yayılması sonuna kadar testli ve ispatlanmış harika performansa neden olmaktadır.

---

## 2. Teknoloji Seçimleri

### NestJS (Backend Tarafında)

- **Yapısal bütünlük:** Yalnız bir Express projesiyle koda girmektense modüller, denetleyiciler ve güvenlik sınırlarını içeren daha yetkin bir mimaridir (DI mimarisine entegredir). Komisyon yapısı ve iş yönetimi kurallarını oluşturmada sınırlandırılmış güçlü alanlara büyük yarar sağlar.
- **Doğuştan veri yapılandırmaları:** Parametre kurallarını el ile tanımlamayı engelleyip, verilerin doğru geldiğinden (`class-validator / class-transformer` vs) net olarak onay almak, veritabanına istenmeyen bilgi işlenmesinin (`ValidationPipe` aracılığıyla) toptan önüne geçer.
- **Güçlü MongoDB bağı:** `@nestjs/mongoose` teknolojisi Mongoose şemalarını ile NestJS'in yapısıyla oldukça tutarlı entegrasyon formülleri içerirler. Ayarlamalar oldukça kısadır.

### MongoDB + Mongoose

- **Doküman değişikliklerin en esnek biçimi:** Aşama süreci detayları projedeki süreç formüllerince ana öğelerle (`stageHistory`, `financialBreakdown` vb anahtarlara sarılarak vs) anlık olarak çağrılır ve bütünleşik yapı olarak gönderilir: MongoDB bu bütünlüğü destekler, karmaşık formlara referans dizilimine vs gibi olaylara hiç girmeyecek alanları rahat bırakır.
- **Atlas sistem yöneticisi:** Karmaşadan uzak hızlı çalışan bir sunucuda doğrudan Mongoose desteğine güvenilir yedekleme altyapısıyla çalışmamıza olanak sağlar (Prototipleme/denemeler için ücretsiz M0 formülü devasa bir destektir).
- **Atomik güncellemelere sadık:** İkinci bir müdahaleye engel olmak adına MongoDB güncellemeleri (`findOneAndUpdate` içerisinde `$set` ve `$push` kurguları vb), verinin yarışıp veya üzerine yazılma çökmesinden %100 oranında kurtararak aşama yönetim makinesinin altını çizer (Detay 6. Bölümdedir).

### Nuxt 3 (Frontend Tarafında)

- **Vue 3 ve SSR entegresi:** Saf SPA oluşturmasak dahi, Vite tabanlı Nuxt altyapımız harika geliştirme komut yapısından dolayı dosyaya atanan pratik eklenti ve yapılarına/otomatik tanıma modüllerinedir (Nitro sunucuları projeye dev hızlı performans verisi eklemesi sağlar).
- **Pinia Desteği:** Nuxt'a direkt entegre, temiz ve hatasız işleyen yapı durumları modülüdür. Eski kurulan kompleks/karmaşık mimarilerindeki (vuex) ağırlığındansa, tüy gibi basit sistem deneyimine zemin açar.
- **Kaliteli TypeScript yetenekleri:** Sistem içindeki prop verileri, dinamik yollanan değişkenler (`ref`) vs; arayüz de en ufak bir bileşendir dahi tam type check kontrolsüz (Type destekli tam hatasız yapılarla vs) olmamasını denetler.

### Tailwind CSS

- **Yardımcı araç sınıflarıyla muhteşem tutarlılık:** Tamamen kendine özgü bir framework arşivi barındırır. En ince ara boşluklarda piksel hesaplamalarını veya gece modu (dark-mode) geçişlerini vs en baştan yazıp karmaşık CSS mimarilerine dönüştürmemek için bulunuzmaz yapıdır.
- **Aşırı hızlandıran Tree-shaking modülü:** Dosya derlenecek sisteme sadece yazılan ve seçilen renk veya satır katarı eklentileri (class objeleri) çıkartılıp dosyanın aşırı küçük/kompak halini güvence altına alıp fazlalık/boş komutları silmesini sağlar.

### Diğer Güçlü Araç Setleri

- **`pdfkit` ve (Türkçe yapılı DejaVu fontu):** Arka plan tarayıcı gereksinimi olmayan tertemiz Node bazlı yazdırma yapısı. Türkçe komut kodlarını tam ve bozulmayan net sembollerden (Ör: ç ş ü) geçirir.
- **`@nestjs/throttler`, `helmet`** — Projede hazır sistemsel donatılma (Dış savunma/Kalkan vb) bileşeni olan eklentiler.
- **`@nestjs/terminus`** — Sistemin yaşamsallık belirtisini ölçen modülleri.
- **`@nestjs/swagger`** — Yazılım için arka ekrandan kod ile senkron canlı belgeleme sunum kütüphanesidir.
- **`concurrently`** — Uygulama süreç başlagıcını iki uçan kanat tarafı bağlamında birleştiten komutlar birliği (`npm run dev`).

---

## 3. Alan Modeli (Domain Model)

Bu yapının en kritik kurgusu **İşlem (Transaction)** verisinden temellenir:

```ts
Transaction {
  _id: ObjectId
  title: string                         // Serbest formlu anlaşma başlığı
  stage: 'agreement' | 'earnest_money' | 'title_deed' | 'completed'
  totalFee: number                      // Hizmet bedeli brüt emlak komisyonu
  listingAgent: ObjectId ref User       // İşleme onaylanacak satışı yürüten / portföy alan danışman yetkilisi
  sellingAgent: ObjectId ref User       // Sözleşmeyi satan danışman yetkilisi
  stageHistory: StageHistoryEntry[]     // Daimi ve salt izi bozmayan aşama dizgesi kaydı (sadece eklenir ileriye yönelik vs)
  financialBreakdown?: {                // Süreç bitti mi işleyen kazanç havuzu (COMPLETED aşamasında otomatik belirir)
    companyCut: number                  // Firma Kesintisi payı
    listingAgentCut: number             // Getirmeyi Sağlayanın payı
    sellingAgentCut: number             // İşlemi Bitiren in payı
  }
  createdAt / updatedAt                 // İşlemi zaman kontrol onaycısı
}

StageHistoryEntry {
  stage: TransactionStage               // Gelen adım değeri
  changedAt: Date                       // Tarih ve saat
  changedBy?: ObjectId ref User         // Kim bu oynamaya işlem aşamasına karar verdi
}
```

Özellikle belirtilmesi kıymetli tasarım faktörleri:

- **Dahili `stageHistory` ve `financialBreakdown` yapısı:** Model tablosunu SQL veri sistemleri mantığı yerine daha okunurluğu düz olan/tam parça gömülü şekille işlem dizgisi haline gelmesini, gereksiz işlemci ağ/ağı sorgu sistem okuma ağırlığını ezer geçer.
- **`totalFee`, konutun piyasa satışıyla vs değil, doğrudan kabul gören komisyon tutarıyla kurgulanır:** Satış kurgulanırken brüt olan fiyat (faturası vs olan vb yetkiler rakam olarak net tanımlıdır; sistem işlerin içinde ekstra matematiklerle kendisini veya okuyucuyu aldatmasındansa bu değer direk dökümlenmiş, bölüşüme en temiz referanstan dahil eylemektedir).
- **Projede `stage` tanımı bir sonuçtan değil ayrıntılı bellekten kurgulanır:** Proje deneme veya listedeki hız optimizeleri açısından en son ne verisi geçirilmiş diye tarihte geri taramalar vb yapmaz; doğrudan kendi ana verisinden liste halinde index lenmesi vb formlar üzerinden çok seri dönüş ile kullanıcı arayüzlerinde işlem vs rahatlığı güvencesidir. Tutarlılık, kurgunun (`updateStage`) altındaki tek merkez kuralları ile onay formundadır.
- **Kurgudaki Finansal Kısım, kapanana dek pasif duruma itilmiştir.** Yapay veriler olan sıfır vs basıp ekranda manasız komisyon dağıtmaktansa sistemin belirsiz (`undefined`) özelliği taşıtılmış, bittikten sonra değerleri alması üzerine arayüzün direkt işlemi bu veriye dayanıp PDF sunusunu vs onaylamasında tetikleyici olmasını netleştirilmiştir.
- **Sistem de Rol tanımı, kural dizilimi karmaşıklığını vs engelleme sadeliği hedeflidir:** Flat yapı olan (`admin` | `agent`) veri izinlerin fazlalığını söküp atan tertemiz yapıdır. Kod satırlarında Türkçe okunan ("danışman") alanı dahi proje kodlaması süreçlerinde emlak pazarındaki orijinal yapı `UserRole.AGENT`'ten (`'agent'`) baz alınmaktadır.

---

## 4. Komisyon Kuralları

Kuralların referans adresi [`backend/src/transactions/utils/commission-calculator.ts`](./backend/src/transactions/utils/commission-calculator.ts) şeklindedir.

Toplam Hizmet (`T`) üzerinden listeleme / satışı tetikleyen kişiler bazındaki (`L`, `S`) dağıtım tablosu (Pure Function - Yansıtıcısız) dizisi yapısındadır:

| Olası Senaryo | Ajans / Kurum Payı | Kaydı (Portföyü) Alanın Kesintisi | Satış İşlemini Üstlenenin Kesintisi |
| --- | --- | --- | --- |
| `L === S` (İşlemi bir kişi bitirdiyse) | `0.5 × T` | `0.5 × T` | `0` |
| `L !== S` (Danışmanlar iş paylaşımlı ise) | `0.5 × T` | `0.25 × T` | `0.25 × T` |

Tasarımın Formüle Uyarlama Nedenleri:

- **Emlak şirket geliri, formülasyonda değiştirilmesi kolay bir sabiti muhafıza alınır (%50 oranıyla vs vb).** Sabit olan oranlar (`AGENCY_SHARE_RATIO`) verisi gibi adlandırılmış veriler de sunulduğundan sistemi tümüyle sarmalayan kod satır hatalarında tek kalemde değişimine uygundur.
- Geri kalan tutar aracı / **danışmanların havuzunda paylaşım görür.** Ortak yapılan işlemsel olay yapılarında yarı yarıya süzgeç kısıtlatır eğer tek personel ise sistem payın bütününü kayda geçiren e yönlendirip satıcı ibare sisteminin "Aynı isme iki kez" veri kopyalamasını ezer sıfır bırakır.
- **İşlemler saf bir fonksiyon üzerinden çağrı alır:** Belge yapılarından/şemalardan uzak; hatasız süzgecinden arındıran salt matematiktir (`totalFee < 0`, `NaN` sorunlarından vs). Test yazımlarında kurguyu simüle edeceğiniz her yere sonradan (BKNZ: PDF/Raporlar) hatasız uymasıdır.
- **Tetikleyici yapı kalkanı:** Yalnızca projenin tamamen ve eksiksiz bittim sürecine geçiş yapılarından bağla (`updateStage` vs kurallarına dayalı ile `COMPLETED` verisinden tetikli), veri üzerinde her defasında çift matematik çakışmasına, bozulma / işlem sorunlu vs olmasına yer vermemektedir.

---

## 5. Aşama Durum Makinesi (State Machine)

Geçişlerin sağlandığı katman olan [`backend/src/transactions/utils/stage-transitions.ts`](./backend/src/transactions/utils/stage-transitions.ts):

```text
SÖZLEŞME (AGREEMENT) ─▶ KAPORA (EARNEST_MONEY) ─▶ TAPU (TITLE_DEED) ─▶ TAMAMLANDI (COMPLETED)
          ▲                      ▲                         ▲                         │
          └─ Geri dönülemeyen kesin süreç geçiş kuralları ─┘                         └─ Son durak
```

Salt dizisel tabloya ve statik `Readonly<Record<stage, stage[]>>` verilerine uygun şekilde yazılmış, `canTransition(current, next)` işlevi vasıtasıyla referans arayabilmektedir.

Adım kodlarından dizilerden (if yongalarından vs den) neden kaçınılmıştır:

- **Tek karar mercii (Single source of truth).** Controller daki kurallardan bağımsız test ya da sistem süzgecini (Servisi vs de), hepsi buradaki makine tablolarından alır eyleme onar bu bir süreç aksatılmaz/atlanamaz.
- **Sıfırdan sorunsuz deneme olanağı (İzole yapılabilecek bir komuttur).** Uygulamayı veritabanlarından izole vs sistemleri ileri kaydırma geri oynatmama/onay komutlarını kurallı testin içine şeffafta çıkartır.
- **Tasarlanabilir Modüllerde Düzenleme (Değişim kolaylıkları):** Belirli dönem vs yöneticiler için atılacak (Yönetici geçişler vb komutları), çok karmaşık `if` döngülerindense süzgeçi tabloda değiştirip genişletebilmeye uyarlıdır (esnektir).

Kurallarımız projedeki **katı olarak süreci vs eylemleri vs geri itmesini** men etmesi üstüne kurgulanmıştır. Gerçek hayattaki kurulan mimari (satışın reddi vs), sisteme verileri bozarak undo yapılmasını (geriye dönüş iptalini süzmeyi) değil o kağıdın resmi evrak/raporlar da da olumsuz son durumu (iptalini) vb deklare eylemektedir. İptal / reddetme özellikleri kurgulamaları sonraki güncellemelere konu edilip şimdiki temiz veri sistemi yansıtması/son durum denetim komutları `COMPLETED` (yani salt/tam ve tek yönlü ile) tertemiz şema çıkarır.

---

## 6. Eşzamanlılık ve Atomik İşlemler (Concurrency & Atomic Updates)

Projedeki yapının `updateStage` eski denemeleri / okuma-değiştirme-ve yazdırma vs döngülerinden ibaretti:

```ts
const doc = await model.findOne({...});
doc.stage = nextStage;
doc.stageHistory.push({...});
await doc.save();
```

Bu tamamen projelere sızacak tehlikeli işlemler vs sistemleridir: 2 danışman işlemi `AGREEMENT` modunda bırakırken anında (sekme ve panellerden eş zamandaki tetiklemesinden) kurguyu `EARNEST_MONEY` e taşırken vs çift veriye sokması iki farklı `stageHistory` yapısına iki kat ilerleme eylemlerine (bozulma hatasına) iterdi.

Güncellenen işlemler, sadece bir referans ile güvencededir (atomic update kuralı):

```ts
await model.findOneAndUpdate(
  { _id, stage: current.stage },           // Sadece bu durumda ön şart olarak kontrol sağlar!
  { $set: { stage: nextStage, /* ilgili kurgular finans vs vb */ },
    $push: { stageHistory: { ... } } },
  { new: true },
);
```

Farklı ekranlardan müdahil olan yapıda ön bellek bozulursa vs vb, filtre birbiriyle uyumsuz çıkar veri `null` dönecektir; servis komutlara izin çıkartmadan API sistemi (409-ConflictException vb hatası) işleyerek döner. Frontend modülündeki `useApi` de o uyarısı yansıtarak UI ye "Süreci tazeleyin ve tekrar onayın!" diye yol gösterecektir.

Çoklu oturum (session vs) işlemlerinden çok vs bu yönlendirmenin neden geçerli ve kararlı olması:

- **MongoDB doğrudan dökümanlarda (Tekil komut vs atom yapısında vb vs) sistemi sarmalar güvence teminatlılarındandır:** Sistem dış verilerine bağlanan dış ilişki gereksinimlerinde bir (multi vs işlemler tabanlı mimariye vs) muhtaç olmadan işlemin kurgusunu/state ini güvenle ezip işlemesi de iç süreçlerin net olmasındandır.
- **Karmaşık replika sistemlerinin devre dışı edilişi:** Atlas platformunun (M0 modelinde dahi pürüzsüz hatasız tam net süzgecindedir vs). Diğer sistemlerin vs gerektirdiği "Mongo Replica/Router vs) ağır yapısına ezen kurgudur.
- **Netlik ve Uyarı İletkeni Olarak Saydamlık:** 409 çağrısında işlemler kapalı kutudan değil (Kim son tıklarsa o ezer hataları ile sisteme sessiz kalmasına vs izin bırakmayarak) kişiye "Dostum yeniden yüklemelisin ve bakmalısın" vs tarzındaki net ve kesin işlem rehberliğinden yansır.

---

## 7. Kimlik Doğrulama ve Yetkilendirme

### Oturum Açma (Login Süreci)

`POST /auth/login` yoluna eklenen veriler `{ email, password }` anahtarları ile yol bulmaktadır. Bu süreç normal bir veri isteğinde güvenlik maksatlı `select: false` (görüntünüme gizlenmesi) kurallarıyla vs şemada izole edilirken, şifrenin (`bcrypt.compare` dizilim şemasında vb) taramadan geçmesinden sonra (Geçerli Gizli JWT Token ı) sistem içerine onayla süzgecine sunmaktadır. Süreçlerde şifre modellemelerin vs güvenliği hook (`pre('save')`) sarmalama döngüsüne işlenerek (hashe / kodlama algoritmasına) dahil edilen parolo/kriptolu altyapımız (`saltRounds = 10` ayarında), güvenlikle saklama işlemi oluşturarak API'ye ham veriden geçirtmektedir.

### Kimliğin Sağlaması / Oturum Transfer (Session) Kodları

- Geri iletilen onaylı sistem (JWT), tarayıcı arayüz çerez (Cookie) belleğindeki `lax` ve adlandırılan "oken" larda yansımaktadır. Lax vs özellikleri sayesinde dış sayfa sistem dolaşımlarında vs CSRF/Hack güvenliklerine kalkan sunar (Tam/Aşırı katı `strict` vs vb ye geçmeyen rahat yapıda/get metotlarına/sayfa yenilenmesi işlemler arası kolay uyumlu) tasarlanmaktadır.
- Projede tasarıma (`HttpOnly`) vs gibi vs bir tanımlayıcı atanmamıştır. Geliştirme kolaylığı vb vs (Bir frontend / middleware proxy'sinden ek atlamalara girmemek) sebebi ile arayüzdeki "fetch" kodları üzerinden manuel okuma kurgusuna (`Authorization:`) gidilebilir şekilde eklentilere onaylamada vs vs tasarlanmıştır. Bu tarz XSS (Script saldırı dezavantajını vs) Nuxt tarafının çok ince kurgusunda/Girdi korumalarının minimal düzende işlenilmesinde Helmet ayarları / sisteminde de kapatılıp denge unsuru yakalanmıştır (Gelecekte proje de çapının tavan yapması vs CSP ya da HttpOnly çerez/server vs modülasyonu ile kusursuz tasarlanmaya entegredir vs).

### Anahtar Başlık Yetkileri (Bearer Header)

- Sistemin içerisindeki modüllerin `useApi` denetçisinden geçip (`Authorization: Bearer <jwt>`) vs kodlanarak ilerletilmesidir. Eklenecek her ne yetki ve/ya istek mekanizmasının (refresh tokenları yeniden sorma log/trace okuma vs kurgularını) vs modül içerisinde bir elden yönetilir / eklentilere uyumlu/basit kılar.
- Olası bir `401` kod yetkisine arayüzde (composables aracı ile), sistem komutunda otomatik sayfa (Cookie/tokenları da silip atarak) anında `login` (Giriş menüye vs geri postalama döngü kurgusuna ezer) yatar. Kullanıcıya net reaksiyon atar hatalar ilevs sistemi çökertip sessizce izlemek gibi bug yapılarından vs uzaktır.

### Rol Modelleme Süreci ve Sistem Sınırları (RBAC)

- Proje yapısı doğrudan (`@Roles(...roles)`) etiketine de entegreli sınıf kontrolü/dekore işlemleri vb komutlarına entegredir.
- Rol yetki (guardları - `RolesGuard`), kodlardan çekilen yetkiler arasındaki sistem vs çelişmelerini (eşitsizliğini) süzer uyumsuz hallerde/içerikler `ForbiddenException` olarak fırlatılarak komutu vs bloke yapmaktadır.
- (Danışmandan/Yöneticide) Controller/Panel kurullarının her iki iş modelini de işleme koyması durumu `@Roles(ADMIN, AGENT)` ayarlarında açık ve vs esnek olmasına mukabil verideki iş komutu süreç korumasında / Business logic ('Yoksa kişinin/danışmanın ilgisi/portföyü vs vs listesinde dahil misiniz?' denetim/engelleyici rotasında) `assertAgentInvolvement` ile sadece danışman kısıtlamasına işlenerek kalkan vs ayırımlarına çok ince net net hat çekmektedir.
- Sistemin Kullanıcılar bölümündeki (`POST /users` - yetki kısıtı yalnız admin vb ayarlıdır lakin okuma (`GET /users` ) vs tüm yetkilerdeki form işlemlerde (Listelerde kendi adlarını vs onay/görme) seçeneğinden sebep paylaşıma sistem vs olarak tamamen izindir.

### Gelişmiş/İstemci Odaklı JWT İşleyiş/Hijyeni

Yetkili kurgudaki okumalardaki fonksiyon/araç (Payload deşifresi/Expiry/süre ölçer `isValidSession` vb) eklentileri arayüzün kalbi olan `utils/jwt.ts` altına odaklanıpta çalışmıştır. Sistem komut dizisinde Plugin / middleware eklenti yapısı (Sayfanın uyanışı sırasıyla, tetiklenen anki Store/Pinia sistemini vs onarması onarmasına) komutların her rotada defalarca API den onay vs (sorgusu çekerse ağırlaşma yansımaları çökme hatalarına (bugs vs)) denetim kargaşına vs engelleyecek net bir akıl (Ben hala sisteme ve yetkiye / süreye layık mıyım vs) mekanizması sistem kurgularımız ile şeffaftır vs.

---

## 8. API Tasarımı

- **Tam kaynak yönelimli Rest yapıları (Resource-oriented).** Sistem vs kurgularında (`/transactions`, `/transactions/:id`, `/stage` , `/export`) dizileri ya da `/auth` sistem komutlarında endüstri standardı Rest kurallarındaki tasarlamaya (URL dizilerine vs) uymaktadır.
- **Her bir nesneyi yansıtan net (DTO parametresi) ve validasyonlu sistem işlemesi.** Payload kurgusu içsel çelişkisinden sızdırmasız (`400`) net mesajlama vs kurgulu ile (Exceptionları havadan tutmaktan) projenin arkaplan kodlarından arınıp Swagger UI (Arayüze) kendi API sini net sızmasına kaynak üretmektedir.
- **Sistem listelerinde sayfalandırmada değişmezlik (Uniform pagination).** Sayfalama arayüz/kod formları (`PaginatedResult<T>`) vb her modüle de standart yansısı ("Toplam/Sayfa durumu") verisi ile Fronted'daki sayfalamak komutlarının "tek tipli yolunu vs " kurar vs eklenti vb ye pürüzsüz uyum/adapte çalışır.
- **Standart Http Kurallı Dönütler.** İşlem onaylandı model (201 / 200), birleşme/yarış durum engeli (409 conflict vs), geçersiz/yok/token uyum arıza sorun vs de (401 ile uyarısı/redirect vs), yanlış eylem yetki talebinden (403 rol uyuşma vb engeli çıkışlarına) ve var olmama durumu/kullanıcının kendi danışman rol listesinde vs gizlenilen kayıtı tarattırma filtre (Sana kapalı vs sana da yok/ 404 eylemi) komut yapılarıyla sistem uyarlamasından faydalar.
- **Durum verisi eylemi özel Rota / yansıtmaları vs (PATCH `/transactions/:id/stage`).** Belgenin değiştirilecek / yön verilebilir kısmı "stage" in bizzat alanındandır vs; kurguyu/adreslendirmeler yapılması ne yapmak istenirliğini dekleme yapısı ileride sistem genişletilir ya da (Ayrı alan yansıtılsın PATCH esnetilecek rotalar genişliğe / çakışmadan sarmal vs yapılsın).
- **Yazılım sistem verisi olan Export Rota / API.** Verinin formatıyla / MIME tip yapısıyla akması `Content-Type: application/pdf` u arayüz okuma (`blob`, `createObjectURL`) arayüz işlevi bearer doğrulama yapısını bozmayıp indirme sisteminde tarayıcıyı yönelten kısıt ("Content-Disposition filename vs ") yapı komut dizisini sağlar vs.
- **Filter (Filtreleme Arayüz sorguları / query param vs ) Seçmeli Esnek Ekleme (Additive - vs ) Sistem.** Fonksiyondan geçen istekler (And mantığı `$and`) içerilerde API Service vs alanlardan kurgu yapısı birbirini okumaya uyum sağlamadan / controller kirliliği vermesinden "kendinden yansır / just work vs ".

---

## 9. Backend Modül Düzeni

```text
app.module.ts
├── ConfigModule (Uygulama da dıştan yükleme sistemi kuralları)
├── MongooseModule (Yapı olarak forRootAsync kullanarak ayar eklentilerine bağlanması vs)
├── ThrottlerModule (Bütün uygulama çaplı APP_GUARD sistemli oran kalkanını devredekine alınımı)
├── TerminusModule           → /health
├── AuthModule               → /auth/login ve /auth/me komutu
├── UsersModule              → /users ve CRUD ayarları
└── TransactionsModule       → İşlemin kendince (/transactions / stage ve export yansıma uç dizileri vs)
```

Projede Kararları Alınmış Katmanlı Tasarı / Kurgu Seçenekleri:

- **Ayar dizinleri (Config) merkezi/baştan entegreli bir eylemdir.** Alt-modüler yansımalar ve `process.env` gibi sistem çağrısının manuel dağınıklık vs si ezen bu teknikte test edilmesine tam koruma ("Dependency injection") / `ConfigService` üzerinden geçilmesiyle verilebilmesi/rahatlılığında kodların vs temiz bırakılması.
- **Oran Denetleyici Kalkanı `APP_GUARD` yapısı varsayımı vs).** Bütün uç komut rotaları ve de istek ağının hızla (brute) sistem saldırısı / çelişme vs kurgusundan geçmesin eylenen bu kurguya `@Throttle` sistemi komut eklenerek (Login istek süresi kotası yansısı / kısılması eklentisi vb gibi vs) modifiye / eklenebilme özelliği.
- **Sağlıklı Boş / İzolasyon `AppController` (/health haricini vs).** Standart olan (ilk yapı test vs Hello) kod çöp vs ("Bu niye var ki kokusu/süreci ezilmiş atılmış komutlardan") vs sadeleşmiş arınmış sistem kodları temizler vs.
- **Fitreleme yapı servis mantığı `TransactionsService` yapısından gelmesidir.** Yansımalar ve MongoDB ($and formüllerindeki vb özel / "private" alanlarca eylemli ("`buildAccessFilter` veya `buildSearchFilter`") kurgularına süzülmektedir vs listeleme paneli olan `findAllPaginated` bu kısacık formüllü bileşenlere sırtını alıp uzayan kilitlenme spagetti ("80 / kod prosedür komutu ") yerine teste el altından test edilen / okunak harika dizinidir.

---

## 10. Frontend Mimarisi

```text
app.vue
└── layouts/default.vue       (Uygulama/Menü Sidebar kurguları ve Layout sistemi, ancak /login'den saklanması dizini vs)
    └── pages/
        ├── index.vue         (dashboard ekranı panel ve liste panosu vs vs)
        ├── transactions/[id].vue (dökümler/history zamanlaması akışı ile pdf yansısı tablosu paneli)
        ├── transactions/new.vue  (Yeni Eklenti Emlak işleme kayıt arayüz panosu (SearchableSelect yapısı içinde vs))
        ├── users.vue             (Liste/Ekleme arayüzü admin ayarlı)
        └── login.vue             (Boş temiz arayüz eklentisinden soyut)

plugins/auth.ts               Uygulamanın yeniden kalkınmasında (store ve jwt test okumasına / yüklenme vs hidratı)
middleware/auth.global.ts     Zorunlu yetki / güvenlik route arayüz rotalama (admin-only vb koruma ve giriş vs check si)
composables/useApi.ts         Sorumluluğa bağıntılı / Bearer iletkenine / otomatik yönelim eklentisi 401 redirect (fetch) süzgeci
utils/{jwt,stage,error}.ts    Bağıntısız (pure-işleyiş vs mağazanın kalbine hizmet komutları ayrılmış modülleri).
components/SearchableSelect.vue  Kusursuza çalışan ComboBox (arama barındıran menüsü Dashboard vs New vs).
stores/{auth,user,transaction}.ts  Pinia State Komut İşleci paneli depolar vs.
types/{transaction,user}.ts   Arkadan API den verileri tanıtan (TypeScript) arayüz şemaları vs..
```

Bölümler Ne İşe Yarar / Yapısal Split (Ayrıştırma) Tasarımı:

- **Sayfaların Orkestra, Depolama Alanının Arşiv olması.** Vue kod bileşeni komutu sayfaların Pinia deposundaki ("Getters" eklentisi vs vs)'den alması ve işin komutu tetiklerine itaatinden yansır (DOM işlemleri vs). Aynı veriyle eyleşme API ağlarından (`watchers / sayfa istek`) her yerin kilitlenme sistem yığılmalarından sayfa verisi (Tutarlılık ve Hız kalibresidir).
- **Projede Fonksiyon sarmaları "Yan etkiyi komutan kontrol (composables)" modülleridir.** `$fetch` eylemisini vs `useApi` den geçirme/sarmalayışı (token veya arıza anı geri dönüşlerin komutlarınıvs ekler). Sayfaya `useFetch` sistemi veya kurgularına (`retry / hata vb vs vs sistemi` ) eklenti yapmak tek elden ("Tek Satır Kod" değişik formüllerinden ) rahatlıkla projelendirilebilir vs eylemi.
- **Ara Kurum ile Başlangıç Tetikleyici Felsefesi / Plugin vs Middleware sistemi.** Eklenti yapısı (plugin) açılıştan sonra (Hydrate/Pinia token çekimi ve depoyu uykudan vs onarma sistemini tetiklenmesi) sağlarken "Auth-Global Middleware" modüllerin rotaya yönüne bakmaktadır. Tüm kod yapısı her iki alanda eş zaman vs çalışmalara (`İlk Boyama Render vs` ile) hızı denetim onar ağı ezip trafik ve gecikmenin sistemsel API silsilelerini engeller verisine/işleme.
- **Bağımsız Parça Modülleri `utils/`.** Fonksiyon (`jwt` expiry kod vs çözümlemesi) ve sistem arayüz form (`stage.ts / error.ts`) modülleri vs saf ve arı sistemlerdir (`FetchError okumaları, Döviz birimi kurgulu (pure) süzgeç yapısı` vb). Kodların / Eklentinin arasına kopya parazitleri çeker vs ("Duplicate/Middleware veya plugin ikisinde barınmasına sızan arızalarından vs kokulardan yalıtımı sistem kurgusundan test edilebilir arı sistemler süzgecidir." vb.

---

## 11. Durum Yönetimi (State Management) Stratejisi

Pinia mağazasında iş yükleyen sistem sorumluluğuna eylemli kurgulu yapı modülleri:

- **`auth` Store sistemleri** — Şifre yetkili kullanıcıların verisini ("Adı, e-posta role/admin-mi vs `isAuthenticated`" durumu kurgulanmaktadır); sadece (login/logout/hidrat) kısımlarına ve sistemde Cookie dizilim eyleminden/tutulma işlemi vs (Yazma iznini yetkiye bağlı alan tek modüldür.
- **`user` verileri depoları** — Arayüzdeki eklenti/listelere (`danışman tablosu / admin sekmesi vb` silsileden) veri (Seçme menüsündeki liste vs `agents` ve aracı eylemleri/kurgusu `getById`) eklentilerine/kurgu (`fetchUsers`, `createUser`) sorumluluğundan/panel işletişi barınır.
- **`transaction` Sistemi deposu** — Yönetimin tam / merkezi alanından tüm işlemin (Gelişmiş Filtresi / Arama listesinden arayüz tepkilere/hata veya pagination komut (`loading` silsilesi / UI Flag)) vs eylem panellerini vs işleyiş ve verileri vs orkestrasına (`fetch / işlem / güncelle` vs silsiledir) dek arayüze/bileşen (page) lere komut (Declarative vs form vs) komutları temiz sunumla bırakım / bağlar vs işlemdir.

Component (Pinia vb kurgu yapı sistem / Store tabanına vb vs sistem kurgusu neden tasarlandı?vs):

- **Sekmeler/Alanların sürekliliğe ve korunmaya (Cross/Page memory continuity/context vs).** Yönetici Panelindeki arayüz işlemlerini (`Filtrelenmiş Veriden -> Ayrıntısına gidiş`) yapısına kurgulanıp (Geri liste/gel geri dönüşlerin eylemlerevs ) tüm filtrenin uçması (Sıfırlama hissi vs). Kurgusal sistem (`Store State-level vs`) korumadan deneyim/ux hissi arayüze (sıkıntı çıkarmasına engelle/bağlam bozdurmaması vb vs ile bağlatısına korur).
- **Projedeki filtre eylemlik dizinin güvenilirlilik borusu/sistemi (Deterministic vs Pipeline).** Kurgunun tetiklenme süreci `fetchTransactions(options bag / torbasına vb)` üzerinden "Var veya Yok (Cleared) vs mi süzgeci `if ('key' in options)` dizilim" ayarına / (`undefined` okuyan hata vs yerine) ayar (eski arızadan `Bütün aşamalar hatasından bug lardan süzdüren`) çok başarılı uyarlama formülü.
- **Verileri değiştirecek (Tetik mekanizmasının Actions - Watchers yer/değiştirilme felsefesine vs üstün tutulması).** Komuta eyleminden sayfaların/component lerinin Store u iştahla / elle değiştirmeden komuta `setAdvancedFilters`, `resetFilters` (işlemler vs yönelti niyetlerinden bağlamasından işleyip) sarmal hata alan daraltıma vs de üst yetenek komuta dizilimi.

---

## 12. Kullanıcı Arayüzü ve Deneyimi (UI/UX) Kararları

- **Gelişmiş Filtre "Advanced Filters" (Panele Gizlenilebilir/Daraltılabilir) Eklentisi** Arayüzü dar ve sıkışık duran bir panel filtresinden yormasına "Sade Panel" ayarı eyleyip gizlenen/aktif ise rozette kendini belli ettirebilen uzman filtre sistemi / gücü kurgusuna oturtumu.
- **`SearchableSelect` Komponent Yapısı/Menüsü.** Tarayıcının ana select / menü panosundaki süzgeçler "Danışman çoklu listelerinde / (+20 üstünde listelerde aranma komut kargaşası ve form/işlem gecikmesidir vs)" iş bilinci zayıf kalarak. ComboBox kurgusuna sahip aranabilen silinen vs sistem / klavye sarmalından geçirmiş (Form Dashboard eklentilerinde ortak hızlı yapılı çalışana dönemiştir vs).
- **Renk / Semantik Aşama Uyumu Rozet Dili (slate / amber / sky / emerald vb vs)** Sistemde satırlarda (Dashboard / Rapor Listelerinde PDF e dek eklemlinen yansıma kurgulamasından vs her renkten aşama tablosuna / göz alçaklığını "Yekten sistem öğrenme vb UX kolaylık vs silsile formülünden tanım" bağlar.
- **Süreçlerdeki Dikey İşlem Zaman/Takip Ağacı vb dizilimler (Timeline)** Projedeki/Model makinedeki dört adımı (Makinası / Geçmiş ve Öncesindeki onay aşama şekil boyutları renk komutlarına arıza vb vs anında güncelin kavranması (Geçmiş / Güncel onay durumu) şekillenmesi ile kolay kılan netliği vb.
- **Anlık Dosya Blob ve API çekirdek (URL.createObjectURL üzerinden okuma / pdf fetch vb vs işlemi)** Doğrudan bir link (A href vs komutundan - bearer doğrulama yapısından eksik yollamasına müracaatına) yapamayacağı korumasını vs/sistem dosya format isim (Content-Disposition vs tarayıcı aktarımı silsilesinden harici yönlendiri vs sistem arayüzüne indiri iletini atar).
- **Yarı / Hibrid 500 Ms Bekletici Eylemi Sistem Çek/Uyarısı (Debounce arama işleyi).** Saniye de 100 kere tık / klavye işleminin API (Maliyeti aşırı / Yavaşlatıcısı vuruş) larına vs gitmesini ("Cevapsız kargaşa") formüllerince süzgeçten geçip "Hızlı ama Mantıklı ucuz yol" (Sweet - spot/gecikme) ayarlarına / formülü uyarlanısı vs.
- **Butonlar ve Eylem Kurgularındaki Standardizasyon boylam (Action butones sabitliği (fixed `h-8`, `whitespace-nowrap`) vs.** Aşama / İşlem butonlarındaki sütun formüllerinin isim değişiklik (Tamamla Advance) harf yapı / boydan uzama tablonun çirkin sekme oynamalara gidişlerini sonlandırmasını vb ince işlenilen kalibrasyonu.

---

## 13. PDF Üretim Süreci

Sistem çıktıya ulaştıran dosya servisinde (`GET /transactions/:id/export ` - pdfkit güdümlü harici bir motor yapısında komut akışıdır):

1. Ana veritabını işlem formüllüsüne / komut çağrısında sistem API sinden (danışman doluları ve Mongoose süzgecinden arınmış hydrate vs belge paketi kurgulamasında sunusu/verilir).
2. Sistem Rapor Üreticisi olan `buildTransactionPdf` modülü (Fontların DejaVu entegresi / Diacritics karakter okuma desteğinden Türkçe komutların `ı ş` vd vb yapılarından) bozuk form verisini tüm sistem çaplı pürüzsüz yazım render kalibre/onay uyarlaması ile işi alır vs.
3. Rapor un bellekte işlenme süreceği/Buffer dökümünden listelenip "(`Promise / doc.on('data')` vs paketi" toplanan array dizi serisi vasıtasına itelenir vb; ne an iş biter onay (resolve / doc.on('end')) verirse doğrudan Header başlıkların yapısı "C-Type(PDF) vd / C-Length ve C-Disposition eklenti (Tarayıcı indirme dökülerine)" yansıttırtan net hatasız API kod sistemine atması akarak işleyiş yansısı/şarj biter.

Buffer Sistem Bekletisi mi Yoksa (Streaming - parça silsile ) akış formunun kurgudan kaçınılması nedenleri:

- **Hata Komutlarındaki Yakalama Determinizmi (Arıza koruma vs determinizimi)** Font ya sistemin Render/çizimi aksadığı vs komut dizesinden/kaza hatasında temiz (`500`) arıza kodunu temiz/mesajı vb verebilmesini (Aksi doğrudan akıtılmasında Tarayıcı "0 KB işlem başarılı indi vs kargaşasını " algılayıcı formlarından ve deşifresinin imkansızlığınından çökmeye / eksik yansıya mani kalkan formül.
- **Sistem de Yansıtacak `Content-Length`.** Sistemin indiriş süreci başından veri/sayısı dosyanın son (bytes count) boylamına dair Tarayıcına / UI da "Tam inme / progress ilerleci (gösterge komutlarına)" yardım atabilmektedir vs doğruluk/onayı yansıması.
- **Test komut senaryolu/Aşırı İşlevin Test Edilebilir Basitizimi vs (Unit testing vs)** Gelişine bir Buffer çıktının (Unit-test doğrulamasındaki Response mutable yapısını oynamalara/denemelerinden "milyar defa kolay vs/sade/zahmetsizce") yollatması / kolaycılığı vs testidir.

Sistem Kaynak/Varlık formülasyon stratejisi:

- Projedeki kurgu fontlar vb varlıklardan komuta/merkezlere (`backend/src/assets/fonts/` komut / adreste durması / eklenti (nest-cli.json daki assets alanı derlenmesi üzerinden `backend/dist/assets/fonts/` kopya çekimine `build time` vb de gitmesi)) vs eklentili sistemidir. Motor projenin yolları/test runners komutunda start kurgusu komut testinden arınmış şekilde vs vb `__dirname` den okuma kolay formudur.

---

## 14. Güvenlik Yaklaşımı

- **Sistemin korumasını Helmet kütüphanesine (Standart API HTTP zırh kalkanı vs eklentileri (X-Content-Options / Referrer vb vs))** teslimi formudur. Swagger UI denetimde dıştan sızmalara engellenmesi kurgulanamayacak csp vs sistem rotalarını yormaz/çökelterek bozukluk hatasının arınmasının basit harden süreç/koruma kurgusu atılmış yansısı formudur.
- **Hız Komut ve IP İstek sınır kalkanı `@nestjs/throttler`** (default dakikada 100/min yapısına / brute-force hack (brute=şifre kırış testlerine)`POST /auth/login` kurgularında çok limit kısıtlamasına (10 istek formülize rotaya vs) sokan sıkı güvenliktir vs.
- **CORS Dış yetki kaynak origin izinleri süzgecidir (`CORS_ORIGIN` env parametre verisi virgüllü vs liste ayarları).** Projenin varsayımı vs yerelden de (`localhost`) test/dev çalışmasından girenlerin vs, tamamen projenin yayılma alanında ana Frontend Panel yöneltmeye/izin adres kısıt ayarına çekici ayar verisi formu güvenliği vb.
- **Komut / DTO denetçisi Global System `ValidationPipe`** komutu (`whitelist: true` ve `forbidNonWhitelisted: true`) ana formlara sarılmış olarak eylemesinden sızma veriyi ("Tanım dışı verilerin direkt red fail i vb vs") fırlatıma ve implicit (sayı / class silsilesinden dönüş kurguları vs güvenlisini sağlar vs.
- **İşlem de Şifre / At-rest Korumanın bcrypt (salt=10 ile vs) Gizli Komutu**. Uygulama DB taramalarda (`select: false / findOne vs dökümlerinde vb vs` ) sızmamasının kazara formlardan hash okundurtma eylemine kapalı sistem komut onay güvenceli yapısı/sistem verisi vs dir.
- **İstemci eylemli UI koruma silsilesine değil Backend tarafı API Rota/RolesGuard eylemine teslimat kurgusu (Rol kalkanlı).** Frontend yetkinin sakla uyarısını kılıfına uydurtur (Kullanıcı / Yetki yetkisizi vs UI da göstermese saklamasına (Eklenti/API ler kuralın arkadan denetimiyle API den ret kodu sistem korumalarına tam güvene eylemekte vs)).
- **Dış listelemeden Kullanıcılardaki (`GET /users` ) Rota Hassasiyet (Şifresiz vs salt data dizimi vs )** Model bazlı yapıda (select ayarları vs) sayesinde gizlilik onayı dış yansımada "düz temiz users vb liste/veri atımı" formu süzgece uyarlanımlış form vs sidir.

---

## 15. Gözlemlenebilirlik (Observability) ve Sağlık Denetimi

- **API Test rotası (Terminus/`GET /health` ucu)** Mongodb vb anlık ping vs cevap / JSON kalıp mimarisindedir. Projeyi işletmek / izleyen barındırma formlarına (uptime-monitor yük denetim silsilesine / orchestrator sarmallarına vb ) sistemin kalp ritmi anlık yanıt ve onayı döküm testleridir.
- **Sistem NestJS Logs/Takip İşlemi Çekirdeği** Süreç tetiklemesinin (Yeni komut ekle/Stage aşama eylemi vs iş kaydı kurgusuna vs) atması/yansılaması. Sonradaki / büyük projeksiyon üretimlere `pino / winston / LoggerService` alt kurgularından 10 numara entegre drop-in (Anında formüle entegreli eklenebilecek basit modülize dizin) mimarisi vardır.
- **Kendini anında Derleyici Özellik /`/docs` altı (Swagger UI)** Proje kurgusuna doküman silsilesine entegre kurgusu ve test formüllerisidir. Developer lara / işletici token/yetkisindeki dış modüllerin "Anında ne varsa oku yansısı / debug et etrafından dolaş vs " kurulum / program barındırmasına ihtiyaç duymaksızın işleyiştir.

---

## 16. Test Stratejisi

Üç yapıda süzülen; Getiri (Efor - Değer) odaklı optimizasyon katmanı senaryosu kurgulanması tasarısı:

1. **Saf Matematik birimleri (Pure-Unit sistemleri) `commission-calculator` ile eklenmeli `stage-transitions` silsilesi formları vs.** Projedeki en invariant / kati kural (satır başına komut yoğunluğu kurgu dizesine vs) en kesin defans gücü ucuza kurgulanan hızlı silsile deterministik komut dizgileridir vs vb.
2. **Servisin API/Mock denetim kurgusu (Unit seviyesi `transactions.service.spec.ts`) yapısının (Mongoose vs Modül simülasyon takas sisteminden `getModelToken` vs) yansısı formu.** Statik okumasının vb vs süzmesine / yetkisinde ötesinde olan eylemcilerin (Audit history silsilesi / hatalı geçitler / Çarpışma conflict tespiti/erişim eylemi filter silsileleri vs) süzümü. Çevik (Fluen-chain takas modeli / `populate/lean vs limit vb execute` simüle komutuna uyarılarak vb) testlerini mükemmel kompakt birer satır mimiğindeki eyleme indirgemesidir vs.
3. **Geneli test ve Dış kapı onay Duman Senaryoları E2E (Smoke-tests `test/app.e2e-spec.ts` yapısı vs)** App in uyanışı tam tetik eylemini dener / `/health vb vs / transactions red vs/ Anonim eyleme` vs API kapısını yansıtmacısı uyanışı iz süreni testi komut eylemidir. Çok hafif inceltilen derinliğindenden kasıtlı eylemdeki (Login vs ileri vs ilerleme flow uç komutları "Derin akış/dönüşlerine feature vs" ilerde yansın diye geniş yelpazede kaba test uyanış formu kurgucu senaryolu yapısıdır vs vs.

Arayüz bileşenlerinde Nuxt vs sistemi Testlere vs (Component Vue Frontend süreç test komut eylemine) kasten dâhil etmeme formülasyonlarına (`Vitest + Testing Library` kurulumu ağır bakım/kurgusunda olan vs ) pinia store'una/state üzerinden arayüz işi olan vs sistemdeki kâra ve zararına sarmalına değer efor uyum görmemesindendir vs.

---

## 17. Geliştirici Deneyimi

- Tüm uygulamada (Root taban üzerinden vs `concurrently`) çift taraflı (renk vb yansıma ile) uyarı **sistemsel komut `npm run dev` in kolay akımı/terminal akrobasisinden (sekmeden sekme vb iş / panel silsilelerine) kurtarımı vs dizilimisidir.**
- Bütün sistemi ana yapı vs/klon vs dizini (`npm run install:all` dizilimiyle root+api+nuxt) tek tık akış kurulum silsilelerine dökücüsüdür/çekici entegre kurgu formu komutları süzgeci işleyişidir.
- Emlak sistemli kurgu vs de ("Test komutlarında Admin var mıydı vs kargaşa friction vs" eylemesine süzgeçteki idman / `npm run seed`). **Tıklama eylemlik (idempotent / onay denetimli komuta) hazır admin / hazır ekiple vb temiz arayüz testini (Boş veri kurgusundan kurtarma vs) kurgusu formu.**
- Değişken dizilerini (".env.example yansısı/front back arası çevre sistemlerini") okuma - revize PR testler/işlemleri dizgesinin netliğinden arınma/eksiksizlik formülesidir (Arayüz vs net çevre dizinidir).
- API format süzgeç komutu olan (**ESLint + Prettier vs**). Arka/Eklenti tarafı Test vs lerde Jest'ten ötürü (mock-simülasyonlar vs Any eylem formüllerinden gümbürtü/uyarı gürültüsünden vb arınma/kapatıcısı / Rahatsızlık uyarı eylem sinyal gürültü kesiş kurallaşmasından (Strict Tip silsilesi rahatlatan testler yansıtır vs)) vs.
- Uygulama çapındaki (**Düz strict-TypeScript kurguları sarmalı / `Any` silinmiş katı eylem vs tipi silsile yansımasından saf komuta onay vs (Generics / İşaret/Mappaed objeler veri tipleriyle vb)** ağır komutu vs ile oyu alan / üstlenen silsile yansısı vs kurgu formudur vs.

---

## 18. Ödünleşimler (Trade-offs) ve Gelecekteki Planlar

Sistem kurgusunda bilinçli / kapsam onayı kurguladığımız varsayım mimari (trade-offs) dizileri ve listeleme sebepleri vs eylemleri vs:

- **Cookie (Sistem oturumu JWT vs si) HttpOnly'e geçilMEMİŞTİR vs kurgulama formu.** Nuxt Proxy API arayüz yansıtmalardansa vs vb XSS küçük rizikosu sistemin saf Bearer header yansısı sadeliği kurgusundan eylemine alınıp tercih vs onayı kurgusudur. Olası Production mimarilerinde Server Side eylemlere (`HttpOnly+Secure+SameSite=lax` sarmal ve Proxy sistemine) uyarlanısı formüle edilişlidir vs.
- **Genel Regex Arama Komutu (Regex arama modülü süzgeci).** İdare seviyesinde binli data vb komut sisteminde sorunsuz işleyişe sahip, lakin kurgunun milyon vb (Large dataset sistemine / Mongo Text Index/Atlas formülü dizgesi komutu geçişleri vs) eklenimine itilebilmektedir vs.
- **Soft-Delete / Data Silim - Arşiv modülü komut kurgu arınması.** Sistem "Kesti / Muhasebeleştirdi" onayı üzerinden eklemeye (Append Onaylı) yapısı vizyondandır. Yaşam döngüsü/yönetim silsilisine kurgu geçilirse ("Komut sil / geri yetki vb") model silsiğine oturtulcaktır vs.
- **Komisyon Oran vs Constantlara gömülü komut oran pay silsilesi / kod dizesidir.** Müşteri ajans istekler vs de verilerin ayarlar veritabanlarına snapshooth aniden basıp okumaya devşirme senaryolar silsilesine ("Settings collection vs formuna vs") kaydırma modüler sistemi eklentisine açık yansısı durmaktadır vs.
- **Sistem bütünselliğinde (Tenants silsileriden) Tekli/Single model kullanım kurgusu dizgesi.** Geniş çoklu modelleme komut yansımasında (Multi-tenant eylemine) yapısına kimliği "Tenant ID" eklentisine query ile geçirmeye uygundur (Query/Döküman sistemlerine sızmasından vs yansıyacak süzgece vs).

Eklenecek projelerin Vizyon ("Çaba / Değer Kazanım komut sırasına - Value/Effort silsilesine vs") dizilmesi liste yansısı vs formu:

- **Correlation başlık / Pino vs Structured (Log ve Çözümcü Eylem/Gözlem vs)** yapısının hata çözümü yetkinliği / debug güvence entegresidir vs.
- **Genel sistem kurulum paket komut/Docker konteynerleri komutu süzgecinden vs (docker-compose up silsilesinden).** Bir tık onboarding yansısına oturtulması komutundan.
- **Sistem Yayın Deployment otomasyon dizisi/entegresi vs** (Vercel/Fly vs Render kurgusu depo komutu/PR onay süzgeci/Preview form testler vs pipeline yapısı vs dizimi).
- **Her sürece Dosya/Açıklama Evrak Notları (Attachments vs Eklenti yansısı) kurgusu silsilesinden vs.** Daha da donanımlı Audit / Muhasebe öykü dökümü kayıt onaması yetkisine süzgeç vs geçittirme komutları vb vs.
- **Yöneticilerin hatalı/yanlış Stage (Yetkisiz vs vb ileri almalara dur vs / İptal onay / Geri döndürme vs soft delete mekanından sarmallıklardan vs)** yapısına süzgecini ileri gidiş formüllü esneme ve genişletilmesi.

---

Tekrar her konuya kurguya eklentilere / Fikirlere, itiraz vs tasarım geliştirme projenin dinamikiğine katkıya tam onaya eylemine kapılı / geri çevirilebilirliğinin ("Business/İş Akışı/Ortam hedeflerinin esnemesinden ötürü") esneklikten formda yapısında tasarlandığı vizyonundan dır. Okuduğunuz için teşekkürler.
