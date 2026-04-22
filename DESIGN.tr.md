# Mimari Tasarım Dokümanı

---

## İçindekiler

1. [Sistem Özeti](#1-sistem-özeti)
2. [Teknoloji Seçimleri](#2-teknoloji-seçimleri)
3. [Veri Modelleme: Gömülü `financialBreakdown` Kararı](#3-veri-modelleme-gömülü-financialbreakdown-kararı)
4. [Durum Makinesi: Aşama Geçişlerinde Katı Backend Koruması](#4-durum-makinesi-aşama-geçişlerinde-katı-backend-koruması)
5. [Saf Fonksiyonlar: `commission-calculator` ve Test Edilebilirlik](#5-saf-fonksiyonlar-commission-calculator-ve-test-edilebilirlik)
6. [Atomik Güncellemeler: Eşzamanlılık Koruması](#6-atomik-güncellemeler-eşzamanlılık-koruması)
7. [Yetkilendirme: API Seviyesinde Veri İzolasyonu (RBAC)](#7-yetkilendirme-api-seviyesinde-veri-izolasyonu-rbac)
8. [Frontend Mimarisi: Pinia, Debounce ve Sayfalamalı Tablo](#8-frontend-mimarisi-pinia-debounce-ve-sayfalamalı-tablo)
9. [Güvenlik Önlemleri](#9-güvenlik-önlemleri)
10. [Test Stratejisi](#10-test-stratejisi)
11. [Takas Noktaları ve Gelecek Çalışmalar](#11-takas-noktaları-ve-gelecek-çalışmalar)

---

## 1. Sistem Özeti

Uygulama, bir emlak ofisinin satış işlemlerini dört aşamalı bir süreç boyunca (sözleşme → kaparo → tapu → tamamlandı) takip eder ve işlem tamamlandığında komisyonu ofis ile ilgili danışmanlar arasında otomatik olarak paylaştırır.

Sistem iki bağımsız servisten oluşur:

- **Backend** — NestJS 11 tabanlı REST API. MongoDB'yi Mongoose üzerinden kullanır; kimlik doğrulamasını JWT ile sağlar.
- **Frontend** — Nuxt 3 (Vue 3 Composition API) ile geliştirilmiş SPA. Merkezi state yönetimi için Pinia kullanır.

İki servis arasındaki sözleşme salt JSON tabanlı HTTP API'dır. Bu ayrım, frontend'in başka bir istemciye (örneğin mobil) kolayca dönüştürülebilmesine ve backend'in bağımsız olarak ölçeklenmesine olanak tanır.

---

## 2. Teknoloji Seçimleri

| Katman | Seçim | Temel Gerekçe |
| --- | --- | --- |
| Backend framework | NestJS 11 | Modüler yapı, dekoratör tabanlı DI, Guard/Pipe/Interceptor katmanları sayesinde kurumsal ölçekte sürdürülebilir kod tabanı. |
| Veritabanı | MongoDB + Mongoose | Gömülü doküman modelinin doğal destek bulması, esnek şema evrimi, `findOneAndUpdate` gibi atomik işlemlerin birinci sınıf API olarak sunulması. |
| Kimlik doğrulama | JWT (Passport) | Durumsuz (stateless) ve yatay ölçeklenebilir; frontend cookie içinde saklar, her istekle `Authorization` başlığında gönderilir. |
| Frontend framework | Nuxt 3 | Dosya tabanlı yönlendirme, SSR yeteneği, Vite tabanlı hızlı geliştirme döngüsü. |
| State yönetimi | Pinia | TypeScript desteği üst düzey, getter/action modeli net, Nuxt ile birinci sınıf entegrasyon. |
| UI | Tailwind CSS | Tasarım tutarlılığını utility-first yaklaşımla güvence altına alır; bundle boyutunu küçük tutar. |
| Validasyon | `class-validator` + `ValidationPipe` | DTO seviyesinde beyansal doğrulama, tip-güvenli runtime koruması. |

---

## 3. Veri Modelleme: Gömülü `financialBreakdown` Kararı

### Karar

Komisyon dökümü (`companyCut`, `listingAgentCut`, `sellingAgentCut`) ayrı bir koleksiyonda tutulmaz; doğrudan `Transaction` dokümanına **gömülü doküman (embedded document)** olarak yazılır.

```typescript
// backend/src/transactions/schemas/transaction.schema.ts
@Prop({ type: FinancialBreakdownSchema, required: false })
financialBreakdown?: FinancialBreakdown;
```

### Neden Gömülü?

Bu kararın üç güçlü gerekçesi vardır ve her biri ürünün uzun vadeli doğruluğu açısından kritiktir.

**1. Muhasebe Bütünlüğü — Anlık Fotoğraf (Snapshot) İlkesi**

Komisyon oranları iş kurallarıdır ve zamanla değişmesi beklenir. Örneğin bugün ofis payı `%50` iken, gelecekte `%40`'a düşebilir. Eğer `financialBreakdown`, komisyon hesaplama servisinden dinamik olarak türetilseydi, **altı ay önce kapanmış bir işlemin** mali raporu bugün açıldığında **yeni oranlarla yeniden hesaplanır** ve geçmiş muhasebe bozulurdu.

Gömülü doküman yaklaşımı, işlem `COMPLETED` durumuna geçtiği anda komisyon dağılımının **anlık fotoğrafını** alır ve bu fotoğrafı işlemle birlikte saklar. Kural gelecekte değişse bile geçmiş kayıtlar olduğu gibi kalır. Bu, finansal sistemlerde "event sourcing lite" veya "immutable accounting snapshot" olarak bilinen iyi bilinen bir örüntüdür.

**2. Okuma Performansı**

İşlem detayını görüntüleyen her sayfa yüklemesinde komisyon dağılımı da gerekir. Ayrı bir koleksiyonla modellense, her detay sorgusu için ek bir `join` (Mongo'da `$lookup`) gerekecekti. Gömülü yapı sayesinde **tek bir `findOne` çağrısı** tüm veriyi getirir.

**3. Atomik Yazma**

İşlem tamamlanırken hem aşama değişimi hem de komisyon dökümü yazılır. Bu iki yazma işleminin **aynı doküman üzerinde, aynı MongoDB operasyonuyla** gerçekleşmesi, tutarsız ara durumların oluşmasını engeller. Ayrı koleksiyon senaryosunda dağıtık işlem veya telafi mantığı gerekirdi.

### Neden Ayrı Koleksiyon Değil?

Ayrı bir `CommissionBreakdown` koleksiyonu; normalize bir ilişkisel veri modelinin alışkanlıklarından doğan bir refleks olurdu. Ancak bu yaklaşım;

- geçmiş kayıtların kural değişikliklerinden etkilenmesine yol açar,
- her okuma için ek `$lookup` maliyeti getirir,
- işlemin kendisi ve dökümü arasında eşzamanlılık kilidi gerektirir.

Bu ürünün bağlamında (bir işlem ↔ bir döküm, 1:1 ilişki, her zaman birlikte okunur) gömülü yapı hem performans hem de doğruluk açısından açık kazanandır.

---

## 4. Durum Makinesi: Aşama Geçişlerinde Katı Backend Koruması

### Problem

Bir işlem dört aşamadan geçer:

```
AGREEMENT → EARNEST_MONEY → TITLE_DEED → COMPLETED
```

Bu sıra iş kuralıdır: bir işlem, kaparo adımı atlanarak doğrudan tapuya geçemez. Eğer bu kural yalnızca frontend'de enforce edilseydi, kötü niyetli veya hatalı bir istemci doğrudan `PATCH /transactions/:id/stage` çağırarak aşamaları atlayabilirdi.

### Çözüm: Saf Veri Olarak Geçiş Matrisi

İzin verilen geçişler ayrı bir utility dosyasında, veri yapısı olarak tanımlanır:

```typescript
// backend/src/transactions/utils/stage-transitions.ts
const ALLOWED_TRANSITIONS: Readonly<Record<TransactionStage, TransactionStage[]>> = {
  [TransactionStage.AGREEMENT]:     [TransactionStage.EARNEST_MONEY],
  [TransactionStage.EARNEST_MONEY]: [TransactionStage.TITLE_DEED],
  [TransactionStage.TITLE_DEED]:    [TransactionStage.COMPLETED],
  [TransactionStage.COMPLETED]:     [],
};

export function canTransition(current: TransactionStage, next: TransactionStage): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}
```

Her `updateStage` isteği üç koruma katmanından geçer:

1. **DTO validasyonu** — `stage` alanı `TransactionStage` enum'u dışında bir değer alamaz.
2. **`canTransition` kontrolü** — mevcut aşamadan istenen aşamaya geçiş bu matriste tanımlı mı?
3. **Atomik MongoDB ön-koşulu** — güncelleme sorgusu, aşamanın hâlâ okuma anındaki değerle aynı olmasını şart koşar (bkz. Bölüm 6).

Bu tasarım "fail fast" ilkesini takip eder: geçersiz geçiş, veri tabanına hiç ulaşmadan `400 Bad Request` ile reddedilir.

### Neden Saf Veri?

Geçişleri `if/else` bloklarıyla veya sınıf metotlarıyla kodlamak yerine **düz bir obje** olarak tanımlamak iki somut avantaj sağlar:

- **Okunabilirlik** — İş analisti bile dosyaya bakıp kuralı anlayabilir.
- **Genişletilebilirlik** — Yeni bir aşama eklendiğinde yalnızca matrise satır eklenir; `canTransition` fonksiyonu değişmez.

---

## 5. Saf Fonksiyonlar: `commission-calculator` ve Test Edilebilirlik

### Karar

Komisyon hesaplaması, bir servis sınıfının metodu olarak değil, **veritabanından tamamen izole edilmiş saf bir fonksiyon** olarak yazılmıştır.

```typescript
// backend/src/transactions/utils/commission-calculator.ts
export function calculateCommission(
  totalFee: number,
  listingAgentId: Types.ObjectId,
  sellingAgentId: Types.ObjectId,
): Required<FinancialBreakdown> {
  const companyCut = totalFee * AGENCY_SHARE_RATIO;
  const agentPool = totalFee - companyCut;
  const isSameAgent = listingAgentId.equals(sellingAgentId);

  if (isSameAgent) {
    return { companyCut, listingAgentCut: agentPool, sellingAgentCut: 0 };
  }
  const splitCut = agentPool / 2;
  return { companyCut, listingAgentCut: splitCut, sellingAgentCut: splitCut };
}
```

### Test Edilebilirlik Avantajı

Bu fonksiyonun ne bir sınıf bağımlılığı, ne bir Mongoose modeli, ne de herhangi bir I/O ihtiyacı vardır. Girdi → çıktı dönüşümü tamamen deterministiktir.

Bu, unit test yazımında devasa bir avantaj sağlar:

- **Mock gerekmez.** Test kodu doğrudan `calculateCommission(1000, idA, idB)` çağırır.
- **Milisaniyeler içinde çalışır.** MongoDB Memory Server, test container veya fixture gerekmez.
- **Kenar durumlar (edge cases) netleşir.** Aynı danışman iki rolü de üstlendiğinde, `totalFee = 0` olduğunda, negatif girdi verildiğinde gibi senaryolar izole biçimde test edilir (bkz. `commission-calculator.spec.ts`).

### İş Kurallarının Servis Katmanından Ayrıştırılması

`TransactionsService` yalnızca **orkestrasyondan** sorumludur: doğru zamanda `calculateCommission` çağrılır, sonuç doğru şekilde persist edilir. İş kuralının **kendisi** servis katmanında değildir.

Bu ayrım, Clean Architecture ve Hexagonal Architecture'ın temel önerilerinden biridir: *domain logic, framework ve altyapıdan bağımsız olmalıdır*. Komisyon kuralının yarın değişmesi gerekirse, dokunulacak tek dosya `commission-calculator.ts`'dir.

---

## 6. Atomik Güncellemeler: Eşzamanlılık Koruması

### Problem

İki kullanıcı aynı işlemi aynı anda ilerletirse ne olur? Naif bir implementasyon şu sırayı izlerdi:

1. İstek A, işlemi okur → `stage = AGREEMENT`
2. İstek B, işlemi okur → `stage = AGREEMENT`
3. İstek A, `stage = EARNEST_MONEY` olarak günceller ve kaparo geçmiş kaydını ekler.
4. İstek B, aynı okumaya dayanarak ikinci kez `stage = EARNEST_MONEY` olarak günceller ve **duplicate** geçmiş kaydı oluşturur.

Bu klasik bir **lost update** (kayıp güncelleme) senaryosudur. Sonuç: `stageHistory` bozulur, denetim kaydı yanlış verir.

### Çözüm: `findOneAndUpdate` ile Optimistic Concurrency

Güncelleme sorgusu iki önemli koşul içerir:

```typescript
// backend/src/transactions/transactions.service.ts
const updated = await this.transactionModel
  .findOneAndUpdate(
    { _id: new Types.ObjectId(id), stage: current.stage }, // ÖN KOŞUL
    update,
    { new: true },
  );

if (!updated) {
  throw new ConflictException(
    'Transaction stage changed concurrently. Please reload and try again.',
  );
}
```

Kritik nokta şudur: sorgu filtresi yalnızca `_id` ile değil, aynı zamanda **okuma anında tespit edilen mevcut aşama** ile eşleşir. MongoDB bu sorguyu tek bir atomik operasyon olarak çalıştırır.

- İstek A kazanır: filtre eşleşir, güncelleme uygulanır, yeni doküman döner.
- İstek B kaybeder: aşama artık `AGREEMENT` değildir, filtre hiçbir dokümanla eşleşmez, `findOneAndUpdate` `null` döner. Servis bunu yakalayıp `409 Conflict` fırlatır.

Bu yaklaşım, ek bir kilit tablosu veya dağıtık kilit mekanizması gerektirmeden; MongoDB'nin doküman bazlı atomik garantisine dayanarak **optimistic concurrency control** uygular.

### Neden Pessimistic Lock Değil?

Pessimistic lock, dokümanı kilitleyip diğer istekleri beklemeye alır. Bu web uygulamaları için kötü bir seçimdir: ölçeklenmez, deadlock riski taşır, istemci timeout'a düşebilir. Optimistic yaklaşım ise çakışma nadir olduğunda neredeyse sıfır maliyetlidir ve çakışma anında açık bir hata mesajıyla kullanıcıyı yönlendirir.

---

## 7. Yetkilendirme: API Seviyesinde Veri İzolasyonu (RBAC)

### Tehdit Modeli

Sistem iki rol tanır: `ADMIN` ve `AGENT`. Güvenlik gereği bir danışman (`AGENT`), başka bir danışmanın işlemlerini **ne listede göremez, ne tek tek okuyabilir, ne de güncelleyebilir**. Yetkiyi yalnızca UI düzeyinde gizlemek yeterli değildir; istek doğrudan `curl` ile atılırsa izolasyon kırılmamalıdır.

### İki Katmanlı Koruma

**Katman 1: Guard ile Kaba Erişim Kontrolü**

`JwtAuthGuard` ve `RolesGuard` controller'a uygulanır. İlki geçerli bir JWT gerektirir, ikincisi rotanın `@Roles()` dekoratöründe tanımlı rollerle isteği yapan kullanıcının rolünü karşılaştırır.

```typescript
// backend/src/transactions/transactions.controller.ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class TransactionsController { ... }
```

**Katman 2: Sorgu Seviyesinde Veri İzolasyonu**

Kaba rol kontrolü yeterli değildir çünkü iki danışman da `AGENT` rolündedir; birbirlerinin verisine erişmemeleri gerekir. Bu nedenle `TransactionsService`, her sorguya kullanıcıya özel bir filtre enjekte eder:

```typescript
// backend/src/transactions/transactions.service.ts
private buildAccessFilter(user: AuthenticatedUser): MongoFilter {
  if (user.role === UserRole.ADMIN) {
    return {};
  }
  const userObjectId = new Types.ObjectId(user.userId);
  return {
    $or: [{ listingAgent: userObjectId }, { sellingAgent: userObjectId }],
  };
}
```

Bu filtre `findAllPaginated`, `findOne` ve `updateStage` dahil **tüm okuma ve yazma sorgularına** otomatik olarak uygulanır. Sonuç:

- `ADMIN` tüm işlemleri görür.
- `AGENT` yalnızca `listingAgent` veya `sellingAgent` olarak dahil olduğu işlemleri görür.
- Başka bir danışmanın işleminin `id`'sini tahmin edip `GET /transactions/:id` çağırmak `404 Not Found` döner (bilgi sızıntısını önlemek için `403` değil `404`).

Bu yaklaşım "row-level security" örüntüsünün MongoDB karşılığıdır ve izolasyonu **controller seviyesinin altında**, yani unutulması en zor katmanda sağlar.

### 7.1 Destekleyici Index'ler

Erişim filtresi ve sıralama **her** okumada uygulandığı için şema hangi index'lerin bu sorguları desteklediğini açıkça tanımlar:

```typescript
// backend/src/transactions/schemas/transaction.schema.ts
TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ stage: 1, createdAt: -1 });
TransactionSchema.index({ listingAgent: 1, createdAt: -1 });
TransactionSchema.index({ sellingAgent: 1, createdAt: -1 });
```

Tüm compound index'ler aynı örüntüyü izler: yüksek seçiciliğe sahip yordam (`stage`, `listingAgent`, `sellingAgent`) başta, sıralama anahtarı (`createdAt: -1`) sonda. Bu sayede RBAC filtreli ve her zaman `.sort({ createdAt: -1 })` ile biten dashboard sorgusu, koleksiyon büyüse bile in-memory sıralamaya gerek kalmadan tek bir index tarama ile karşılanır.

---

## 8. Frontend Mimarisi: Pinia, Debounce ve Sayfalamalı Tablo

### 8.1 Pinia ile Merkezi State Yönetimi

Frontend üç Pinia store'u etrafında örgütlenmiştir:

- `stores/auth.ts` — oturum bilgisi, rol kontrolü, token yönetimi.
- `stores/transaction.ts` — işlem listesi, sayfalama durumu, aktif filtreler, yükleme ve hata durumları.
- `stores/user.ts` — admin panelinde kullanılan danışman listesi.

Bu tasarım, bileşenler arası "props drilling" ihtiyacını ortadan kaldırır. `İşlem Panosu` sayfası filtre değiştirdiğinde yalnızca store'u günceller; tablo, sayfalama ve filtre rozetleri bu değişikliği reaktif olarak yansıtır.

State'in tek kaynağı store olduğundan, sayfa yenilense bile filtrelerin ve sayfa numarasının yeniden kurulumu basittir.

### 8.2 Arama Çubuğunda 500ms Debounce

Naif bir arama implementasyonunda her tuş vuruşu bir API isteği tetikler. Kullanıcı "Kadıköy" yazdığında 7 ayrı istek gider, ilk 6'sı gereksizdir.

`pages/index.vue` dosyasında bu sorun tam olarak 500ms'lik bir debounce ile çözülür:

```typescript
// frontend/pages/index.vue
const SEARCH_DEBOUNCE_MS = 500
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (next) => {
  if (searchTimer !== null) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    if (next === transactionStore.search) return
    void transactionStore.fetchTransactions({ search: next, resetPage: true })
  }, SEARCH_DEBOUNCE_MS)
})
```

Kritik detaylar:

- Her tuş vuruşunda önceki zamanlayıcı iptal edilir. Yalnızca kullanıcı 500ms boyunca yazmayı bıraktığında istek tetiklenir.
- Timer tetiklendiğinde, değer store'dakiyle aynıysa istek atılmaz (ör. kullanıcı yazıp geri sildiyse).
- `resetPage: true` — filtre değişince sayfa numarası 1'e döner; aksi halde kullanıcı 3. sayfada filtre değiştirdiğinde boş sonuç görebilir.

Sonuç: API yükü yaklaşık 7× azalır, algılanan performans iyileşir.

### 8.3 Nuxt ile Sayfalamalı Tablo

Backend'den dönen yanıt her zaman şu sözleşmeyi takip eder:

```typescript
interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}
```

Frontend, Önceki/Sonraki buton durumlarını tek bir `page < totalPages && totalPages > 0` kontrolüyle türetir; hat üzerinde gereksiz boolean alanlar taşınmaz. Store bu sözleşmeyi "Sayfa X / Y" etiketi ve Önceki/Sonraki butonlarına dönüştürür. Tüm filtreler (arama, aşama, fiyat aralığı, tarih aralığı, danışman) aynı `fetchTransactions` action'ı üzerinden çalışır; query string inşası store'un sorumluluğundadır. Bu, API çağrısının bileşenler arasında tekrar etmesini engeller.

### 8.4 `useApi` Composable'ı ve Token Akışı

Frontend'in tüm HTTP çağrıları tek bir composable üzerinden geçer:

```typescript
// frontend/composables/useApi.ts
return $fetch.create({
  baseURL: config.public.apiBase,
  onRequest({ options }) {
    if (tokenCookie.value) {
      headers.set('Authorization', `Bearer ${tokenCookie.value}`)
    }
  },
  async onResponseError({ response }) {
    if (response.status === 401) {
      tokenCookie.value = null
      if (import.meta.client) await navigateTo('/login')
    }
  },
})
```

Bu tasarım iki çapraz kesim endişesini (cross-cutting concern) tek yerde çözer:

- **Kimlik doğrulama** — her istek otomatik olarak Bearer token'ını ekler.
- **Oturum süresi bitimi** — 401 cevabı alınırsa token temizlenir ve kullanıcı login sayfasına yönlendirilir.

Diğer tüm store'lar ve sayfalar bu composable'ı kullanır; hiçbir bileşen `fetch` veya `axios`'u doğrudan çağırmaz.

---

## 9. Güvenlik Önlemleri

Uygulama, standart OWASP Top 10 risklerine karşı aşağıdaki önlemleri uygular.

| Risk | Önlem |
| --- | --- |
| Parola sızıntısı | `bcrypt` ile `10` salt round; `User.password` alanında `select: false`, yani varsayılan sorgularda asla dönmez. |
| Brute force login | `@Throttle({ limit: 10, ttl: 60_000 })` yalnızca `/auth/login` rotasına özel; genel throttler tüm rotalarda aktiftir. |
| XSS / Injection | `helmet` middleware; `ValidationPipe` ile `forbidNonWhitelisted: true` — beyan edilmeyen alanlar isteğin tamamını reddeder. |
| Regex DoS | Arama filtresinde kullanıcı girdisindeki regex özel karakterleri (`.*+?^${}()|[]\`) `buildSearchFilter` içinde escape edilir. |
| CORS | `CORS_ORIGIN` ortam değişkeniyle kontrol edilir; kimlik bilgili istek yalnızca beyaz listedeki origin'lerden kabul edilir. |
| JWT | Secret environment değişkeninden okunur; `JWT_SECRET` yoksa uygulama başlangıçta fail-fast eder. |
| İç hata sızıntısı | `AllExceptionsFilter`, bilinmeyen tüm istisnaları generic `500 InternalServerError`'a dönüştürür ve gerçek stack trace'i yalnızca sunucu log'una yazar. |
| Hatalı konfigürasyon | `validateEnv` başlangıçta çalışır; zorunlu değişkenlerden biri (`MONGODB_URI`, `JWT_SECRET`) eksik veya geçersizse boot aşamasını reddeder. |

### 9.1 Environment Doğrulaması — Başlangıçta Fail-Fast

Environment değişkenlerini her istekte veya her provider'ın içinde lazy kontrol etmek yerine, gerekli konfigürasyon `class-validator` dekoratörlü bir sınıf olarak tanımlanır ve `ConfigModule.forRoot({ validate })` hook'una bağlanır:

```typescript
// backend/src/config/env.validation.ts
class EnvironmentVariables {
  @IsString() @IsNotEmpty() MONGODB_URI!: string;
  @IsString() @IsNotEmpty() JWT_SECRET!: string;
  @IsOptional() @IsInt() @Min(1) PORT?: number;
  // ...
}
```

Eksik bir `JWT_SECRET`, ilk `/auth/login` çağrısında kafa karıştırıcı bir `500` üretmek yerine uygulamayı anında başlatmadan düşürür ve tek ekranlık net bir hata operatörü `.env.example`'a yönlendirir. Fail-fast, prod'da hayalet bir hatayı kovalamaktan her zaman ucuzdur.

### 9.2 Global Exception Filter — Tek Tip Hata Gövdesi

Backend'den dışarı çıkan her hata `AllExceptionsFilter`'ın içinden geçer ve kararlı, tek tip bir yanıt gövdesi üretir:

```json
{ "statusCode": 404, "message": "Transaction X not found", "error": "NotFoundException", "path": "/transactions/X", "timestamp": "2026-04-21T21:09:18.763Z" }
```

Filter'ın üç sorumluluğu vardır:

1. **`HttpException` türevlerini olduğu gibi geçir** — status ve mesajları zaten client'a uygun.
2. **Mongoose hatalarını dönüştür** — `CastError` ve `ValidationError`, insan tarafından okunabilir bir mesajla `400 Bad Request`'e map edilir.
3. **Bilinmeyeni izole et** — geri kalan her şey generic bir gövde ile `500 InternalServerError`'a dönüşürken orijinal stack trace sadece sunucu log'una yazılır. İçsel detaylar (DB driver mesajları, stack frame'ler, kütüphane iç yapısı) client'a sızmaz.

### 9.3 İstek Loglama

İnce bir `RequestLoggerMiddleware` her HTTP yanıtı için tek satırlık özet basar:

```
LOG  [HTTP] GET /health -> 200 (6.7ms)
WARN [HTTP] GET /transactions -> 401 (1.4ms)
```

Log seviyesi status'ü takip eder: `2xx → LOG`, `4xx → WARN`, `5xx → ERROR`. Gövde ve header log'lanmaz; böylece token, parola veya kişisel bilgi log aggregator'a sızmaz.

---

## 10. Test Stratejisi

Test stratejisi, Bölüm 5'te açıklanan izolasyon ilkesine dayanır. Domain logic saf fonksiyonlarda toplandığından, tüm test paketi altyapı dokunmadan yazılır — MongoDB Memory Server, test container ya da fixture gerekmez.

Paket iki katmandan oluşur: geniş tabanda saf fonksiyonları doğrulayan hızlı unit testler ve orta katmanda Mongoose modeli mock'lanmış servis testleri.

### 10.1 Unit Testler — Saf Fonksiyonlar

**`backend/src/transactions/utils/commission-calculator.spec.ts`** — komisyon kuralının her dalını mock ve I/O kullanmadan deterministik biçimde doğrular.

| Senaryo | Test case | Amaç |
| --- | --- | --- |
| Aynı listeleme & satış danışmanı | `gives the full agent pool to the single agent` | 100.000 ücrette tek danışman 50.000 alır, satış payı 0. |
| Aynı listeleme & satış danışmanı | `works when both parameters are different ObjectId instances with the same value` | Referans eşitliği yerine `.equals()` kullanıldığı doğrulanır. |
| Farklı danışmanlar | `splits the agent pool equally (25% / 25%)` | 100.000 ücrette iki danışman da 25.000 alır. |
| Farklı danışmanlar | `honors the configured agency share ratio` | `companyCut` her zaman `totalFee * AGENCY_SHARE_RATIO`'ya eşittir. |
| Kenar durumlar | `returns all zeros when totalFee is 0` | Sıfır ücret üç alanı da sıfır döndürür. |
| Kenar durumlar | `returns all zeros when totalFee is 0 and agents are the same` | Aynı danışman dalı sıfır ücreti şişirmez. |
| Kenar durumlar | `throws when totalFee is negative` | Negatif değer, net bir hata mesajıyla fail-fast olur. |
| Kenar durumlar | `throws when totalFee is NaN` | `NaN` aynı koruma ile reddedilir. |

**`backend/src/transactions/utils/stage-transitions.spec.ts`** — geçiş matrisini `it.each` tablo tabanlı iddialarla zorlar.

| Grup | Kapsam |
| --- | --- |
| `valid forward transitions` | `AGREEMENT → EARNEST_MONEY`, `EARNEST_MONEY → TITLE_DEED`, `TITLE_DEED → COMPLETED`. |
| `skipping stages is forbidden` | `AGREEMENT → TITLE_DEED`, `AGREEMENT → COMPLETED`, `EARNEST_MONEY → COMPLETED`. |
| `backward transitions are forbidden` | Dört aşama arasındaki altı geri geçişin tamamı. |
| `self transitions are forbidden` | Her aşama için `X → X`. |
| `COMPLETED is a terminal state` | `COMPLETED`'den hiçbir geçişe çıkılamaz. |

### 10.2 Servis Testleri — Mongoose Mock'lanmış

**`backend/src/transactions/transactions.service.spec.ts`** — orkestrasyonu, yetkilendirmeyi ve durum makinesi sözleşmesini, Mongoose modelini in-memory `jest` mock'larıyla değiştirerek doğrular.

| Özellik | Test case | Amaç |
| --- | --- | --- |
| `create` | `inserts a transaction with an initial AGREEMENT stage history entry` | Yeni işlem `AGREEMENT` ile başlar ve ilk `stageHistory` kaydı oluşturan kullanıcı tarafından yazılır. |
| `create` | `forbids agents from creating transactions where they are not involved` | Bir danışman, başka iki danışman adına işlem oluşturamaz (`ForbiddenException`). |
| `create` | `allows agents that list themselves as the listing agent` | Danışman, kendisini `listingAgent` olarak gösterdiği işlemi oluşturabilir. |
| `updateStage` | `throws NotFoundException when the transaction does not exist` | Eksik id 404 ile sonuçlanır. |
| `updateStage` | `throws BadRequestException for invalid forward transitions` | `AGREEMENT → COMPLETED`, yazmaya geçmeden reddedilir. |
| `updateStage` | `throws BadRequestException when already in the requested stage` | Aynı aşamaya geçiş reddedilir. |
| `updateStage` | `persists the next stage and stage history on a valid transition` | `$set` ve `$push` gövdesi ile önceki aşamayı şart koşan filtre doğru şekilde üretilir. |
| `updateStage` | `computes financialBreakdown when transitioning to COMPLETED` | 100.000 → `{ company: 50.000, listing: 25.000, selling: 25.000 }` finale geçişte atomik olarak yazılır. |
| `updateStage` | `throws ConflictException when another writer changed the stage first` | Optimistic-concurrency kontrolü (bkz. Bölüm 6) `null` sonucu HTTP 409'a dönüştürür. |
| `findOne` erişim kontrolü | `applies an access filter for agents to prevent viewing foreign transactions` | Danışman sorgusuna `$or` filtresi eklenir (bkz. Bölüm 7). |
| `findOne` erişim kontrolü | `does not restrict admins via an access filter` | Admin sorgusunda `$or` filtresi yer almaz. |

Bu iki katman birlikte, tip sisteminin tek başına garanti edemediği üç sorumluluğu kapsar: mali aritmetik, durum makinesi ve rol tabanlı erişim kontrolü. HTTP sarmalı (guard, pipe, filter) geliştirme sırasında canlı API'ye yapılan çağrılar ve Swagger arayüzü üzerinden deneniyor; ayrı bir e2e iskeleti tekrara düşeceği için tutulmuyor.

---

## 11. Takas Noktaları ve Gelecek Çalışmalar

Hiçbir tasarım kararı bedelsiz değildir. Mevcut seçimlerin bilinçli olarak kabul edilmiş sınırlamaları şunlardır:

- **`financialBreakdown` gömülü olduğu için** komisyon dökümünü ayrı bir raporlama servisine taşımak istenirse migration gerekir. Kabul edilebilir; çünkü geçmiş verinin immutable kalması daha yüksek öncelikli bir hedeftir.
- **Optimistic concurrency** çakışma anında kullanıcıya manuel "yeniden dene" gösterir. Yüksek çakışma beklenen alanlarda (nadiren) pessimistic lock veya queue tabanlı serialization tercih edilebilir. Bu ürünün kullanım profilinde çakışma istisnadır.
- **RBAC iki seviyelidir** (`ADMIN`, `AGENT`). Ekip yöneticisi gibi ara roller eklemek gerekirse `UserRole` enum'u ve `buildAccessFilter` genişletilmelidir; mevcut yapı bunu kolaylaştırır.
- **Frontend debounce süresi** 500ms olarak sabittir. Çok hızlı yazan kullanıcılar için kısa, çok yavaş yazanlar için uzun gelebilir. İlerleyen sürümlerde kullanıcı ayarlarına taşınabilir.

Gelecek iterasyonlar için olası gelişmeler: WebSocket üzerinden canlı aşama güncellemeleri, raporlama için okuma replika'sı, ve `stageHistory` üzerinden tam bir denetim (audit log) paneli.

---

*Bu doküman kodla birlikte güncel tutulmalıdır. Mimari bir karar değiştiğinde ilgili bölüm revize edilmelidir.*

---

## Canlı Dağıtım

- **Frontend:** https://estate-comission-app.vercel.app (Vercel)
- **Backend:** https://estate-comission-app.onrender.com (Render)
- **Health probe:** https://estate-comission-app.onrender.com/health

Backend MongoDB Atlas M0 cluster'ına bağlanır. Sırlar (veritabanı URI'si,
JWT secret, CORS origin) her bir hosting sağlayıcısının environment
yapılandırmasında tutulur ve hiçbir zaman repo'ya commit edilmez.

