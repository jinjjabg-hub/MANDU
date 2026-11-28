// MANDU — 약관·환불·해지 안내, 서버 깨우기, 앱 시작 코드(페이지를 열면 바로 실행), 서비스 워커 등록
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 약관·환불정책·구독 해지 (웹) ───────────────────────────────────
// 서버 깨우기: Render 무료 서버가 잠들어 있으면 첫 요청이 30초 가까이 걸려서, 화면을 열 때 미리 한 번 부른다.
function wakeServer(){
  // 서버를 깨우면서, AI 번역을 쓸 수 있는 서버인지도 함께 확인한다
  try{
    fetch(SERVER_URL+'/api/ping',{cache:'no-store'})
      .then(function(r){return r.json();})
      .then(function(d){
        window._aiAvailable=!!(d&&d.ai);if(typeof initAiTranslate==='function')initAiTranslate();
        window._overageFrom=(d&&d.overageFrom)||null;
        // 플랜 한도는 서버 값을 기준으로 (숫자만 받아들임)
        if(d&&d.planLimits&&typeof d.planLimits==='object'){
          Object.keys(d.planLimits).forEach(function(k){const v=d.planLimits[k];if(typeof v==='number'&&v>=0)PLAN_LIMITS[k]=v;});
        }
        if(d&&typeof initLoginOptions==='function')initLoginOptions(d);
      })
      .catch(function(){});
  }catch(e){}
}
wakeServer();
// 로그인 전 화면(온보딩·로그인·게스트)도 휴대폰 언어로 보여줌
try{applyUILanguage(isGuest?_guestLang():detectBrowserLang());document.documentElement.lang=_uiLang;}catch(e){}
initLoginOptions();   // _uiLang 선언 뒤에 실행해야 함
handleKakaoReturn();

const LEGAL_MSG={
  ko:{pack_notice:'1회 결제 · 자동결제 없음 · 충전 글자는 월 한도를 다 쓴 뒤 사용되고 구매일부터 1년간 유효해요 · 결제하면 {terms}과 {refund}에 동의하는 것으로 봐요. 충전 글자를 쓰기 시작하면 청약 철회가 제한될 수 있어요.',terms:'이용약관',terms_sub:'서비스 이용 조건',refund:'환불정책',refund_sub:'정기결제 해지·환불 기준',
      plan_notice:'매월 같은 날 자동결제 · 언제든 해지 가능 · 결제하면 {terms}과 {refund}에 동의하는 것으로 봐요. 결제 후 유료 한도로 번역을 쓰면 청약 철회가 제한될 수 있어요.',
      past_due:'자동결제 실패 — 카드를 확인해 주세요. {date}까지 다시 시도하고, 그래도 안 되면 무료로 바뀌어요',resubscribe:'다른 카드로 다시 구독',
      next:'다음 결제일 {date}',cancel:'구독 해지',canceled:'해지됨 · {date}까지 이용',resume:'해지 취소',
      cancel_confirm:'정기결제를 해지할까요?\n\n{date}까지는 지금 플랜을 그대로 쓸 수 있고, 그 뒤로는 결제되지 않아요.',
      cancel_done:'해지됐어요. {date}까지 이용할 수 있어요.',resume_done:'해지를 취소했어요. 다음 결제일에 자동결제돼요.',
      login_agree:'가입 시 {terms} 및 {privacy}에 동의하는 것으로 간주됩니다.',privacy:'개인정보처리방침'},
  en:{pack_notice:'One-time payment · No auto-renewal · Top-up characters are used after your monthly quota and stay valid for 1 year · By paying you agree to the {terms} and {refund}. Withdrawal may be limited once you start using them.',terms:'Terms of Service',terms_sub:'Conditions of use',refund:'Refund Policy',refund_sub:'Cancellation and refunds',
      plan_notice:'Billed monthly on the same day · Cancel anytime · By paying you agree to the {terms} and {refund}. Withdrawal may be limited once you use the paid quota.',
      past_due:'Automatic payment failed — please check your card. We will retry until {date}; after that you move to Free',resubscribe:'Subscribe with another card',
      next:'Next payment {date}',cancel:'Cancel subscription',canceled:'Canceled · active until {date}',resume:'Undo cancel',
      cancel_confirm:'Cancel your subscription?\n\nYou keep your current plan until {date}, and you won\'t be charged after that.',
      cancel_done:'Canceled. You can use your plan until {date}.',resume_done:'Cancellation undone. You will be billed on the next payment date.',
      login_agree:'By signing up you agree to the {terms} and {privacy}.',privacy:'Privacy Policy'},
  it:{pack_notice:'Pagamento unico · Nessun rinnovo automatico · I caratteri ricaricati si usano dopo il limite mensile e valgono 1 anno · Pagando accetti i {terms} e la {refund}. Il diritto di recesso può essere limitato una volta iniziato a usarli.',terms:'Termini di servizio',terms_sub:'Condizioni di utilizzo',refund:'Politica di rimborso',refund_sub:'Disdetta e rimborsi',
      plan_notice:'Addebito mensile nello stesso giorno · Disdici quando vuoi · Pagando accetti i {terms} e la {refund}. Il diritto di recesso può essere limitato una volta usato il limite a pagamento.',
      past_due:'Pagamento automatico non riuscito — controlla la carta. Riproveremo fino al {date}, poi passerai al piano gratuito',resubscribe:'Abbonati con un\'altra carta',
      next:'Prossimo pagamento {date}',cancel:'Annulla abbonamento',canceled:'Annullato · attivo fino al {date}',resume:'Annulla la disdetta',
      cancel_confirm:'Vuoi annullare l\'abbonamento?\n\nMantieni il piano attuale fino al {date}, poi non verrà più addebitato nulla.',
      cancel_done:'Annullato. Puoi usare il tuo piano fino al {date}.',resume_done:'Disdetta annullata. Il pagamento verrà addebitato alla prossima scadenza.',
      login_agree:'Registrandoti accetti i {terms} e l\'{privacy}.',privacy:'Informativa sulla privacy'},
  da:{pack_notice:'Engangsbetaling · Ingen automatisk fornyelse · Optankede tegn bruges efter din månedlige kvote og gælder i 1 år · Ved betaling accepterer du {terms} og {refund}. Fortrydelsesretten kan være begrænset, når du begynder at bruge dem.',terms:'Servicevilkår',terms_sub:'Vilkår for brug',refund:'Refusionspolitik',refund_sub:'Opsigelse og refusion',
      plan_notice:'Betales månedligt på samme dato · Opsig når som helst · Ved betaling accepterer du {terms} og {refund}. Fortrydelsesretten kan være begrænset, når den betalte kvote er taget i brug.',
      past_due:'Automatisk betaling mislykkedes — tjek dit kort. Vi prøver igen indtil {date}, derefter skifter du til Gratis',resubscribe:'Abonnér med et andet kort',
      next:'Næste betaling {date}',cancel:'Opsig abonnement',canceled:'Opsagt · aktivt til {date}',resume:'Fortryd opsigelse',
      cancel_confirm:'Vil du opsige dit abonnement?\n\nDu beholder dit nuværende abonnement til {date}, og derefter trækkes der ikke flere betalinger.',
      cancel_done:'Opsagt. Du kan bruge dit abonnement til {date}.',resume_done:'Opsigelsen er fortrudt. Betalingen trækkes på næste forfaldsdato.',
      login_agree:'Ved tilmelding accepterer du {terms} og {privacy}.',privacy:'Privatlivspolitik'},
  ru:{pack_notice:'Разовый платёж · Без автопродления · Докупленные символы расходуются после месячного лимита и действуют 1 год · Оплачивая, вы принимаете {terms} и {refund}. После начала использования право на отказ может быть ограничено.',terms:'Условия использования',terms_sub:'Правила пользования',refund:'Политику возврата',refund_sub:'Отмена и возврат средств',
      plan_notice:'Ежемесячное списание в тот же день · Отмена в любое время · Оплачивая, вы принимаете {terms} и {refund}. После использования платного лимита право на отказ может быть ограничено.',
      past_due:'Автоплатёж не прошёл — проверьте карту. Мы попробуем снова до {date}, после этого вы перейдёте на бесплатный тариф',resubscribe:'Оформить подписку с другой картой',
      next:'Следующий платёж {date}',cancel:'Отменить подписку',canceled:'Отменено · действует до {date}',resume:'Вернуть подписку',
      cancel_confirm:'Отменить подписку?\n\nТекущий тариф сохранится до {date}, после этого списаний не будет.',
      cancel_done:'Подписка отменена. Тарифом можно пользоваться до {date}.',resume_done:'Отмена отозвана. Списание пройдёт в следующую дату платежа.',
      login_agree:'Регистрируясь, вы принимаете {terms} и {privacy}.',privacy:'Политику конфиденциальности'},
  ja:{"pack_notice":"1回払い · 自動決済なし · チャージした文字は月の上限を使い切った後に使われ、購入日から1年間有効です · 決済すると{terms}と{refund}に同意したものとみなします。チャージした文字を使い始めると申込みの撤回が制限される場合があります。","terms":"利用規約","terms_sub":"サービス利用条件","refund":"返金ポリシー","refund_sub":"定期決済の解約・返金基準","plan_notice":"毎月同じ日に自動決済 · いつでも解約可能 · 決済すると{terms}と{refund}に同意したものとみなします。決済後に有料の上限で翻訳を使うと申込みの撤回が制限される場合があります。","past_due":"自動決済に失敗しました — カードを確認してください。{date}まで再試行し、それでも失敗すると無料プランに変わります","resubscribe":"別のカードで再登録","next":"次回の決済日 {date}","cancel":"サブスクリプションを解約","canceled":"解約済み · {date}まで利用可能","resume":"解約を取り消す","cancel_confirm":"定期決済を解約しますか？\n\n{date}までは今のプランをそのまま使え、その後は決済されません。","cancel_done":"解約しました。{date}まで利用できます。","resume_done":"解約を取り消しました。次回の決済日に自動決済されます。","login_agree":"登録すると{terms}および{privacy}に同意したものとみなされます。","privacy":"プライバシーポリシー"},
  zh:{"pack_notice":"一次性付款 · 无自动扣款 · 充值字数在月额度用完后使用，自购买日起1年有效 · 付款即视为同意{terms}和{refund}。开始使用充值字数后，撤回申请可能受到限制。","terms":"使用条款","terms_sub":"服务使用条件","refund":"退款政策","refund_sub":"订阅取消与退款标准","plan_notice":"每月同一天自动扣款 · 可随时取消 · 付款即视为同意{terms}和{refund}。付款后使用付费额度翻译，撤回申请可能受到限制。","past_due":"自动扣款失败 — 请检查银行卡。我们会重试到{date}，仍失败将改为免费方案","resubscribe":"用其他卡重新订阅","next":"下次扣款日 {date}","cancel":"取消订阅","canceled":"已取消 · 可使用到{date}","resume":"撤销取消","cancel_confirm":"要取消订阅吗？\n\n在{date}之前可以继续使用当前方案，之后不再扣款。","cancel_done":"已取消。可以使用到{date}。","resume_done":"已撤销取消。将在下次扣款日自动扣款。","login_agree":"注册即视为同意{terms}和{privacy}。","privacy":"隐私政策"},
  es:{"pack_notice":"Pago único · Sin renovación automática · Los caracteres recargados se usan después de tu cuota mensual y valen 1 año desde la compra · Al pagar aceptas los {terms} y la {refund}. El derecho de desistimiento puede limitarse cuando empieces a usarlos.","terms":"Términos de servicio","terms_sub":"Condiciones de uso","refund":"Política de reembolso","refund_sub":"Cancelación y reembolsos","plan_notice":"Cobro mensual el mismo día · Cancela cuando quieras · Al pagar aceptas los {terms} y la {refund}. El derecho de desistimiento puede limitarse una vez que uses la cuota de pago.","past_due":"Falló el pago automático — revisa tu tarjeta. Lo intentaremos de nuevo hasta el {date}; después pasarás al plan gratuito","resubscribe":"Suscribirse con otra tarjeta","next":"Próximo pago {date}","cancel":"Cancelar suscripción","canceled":"Cancelada · activa hasta el {date}","resume":"Deshacer cancelación","cancel_confirm":"¿Cancelar tu suscripción?\n\nConservas tu plan actual hasta el {date} y después no se te cobrará más.","cancel_done":"Cancelada. Puedes usar tu plan hasta el {date}.","resume_done":"Cancelación anulada. Se cobrará en la próxima fecha de pago.","login_agree":"Al registrarte aceptas los {terms} y la {privacy}.","privacy":"Política de privacidad"},
  fr:{"pack_notice":"Paiement unique · Sans renouvellement · Les caractères rechargés sont utilisés après votre quota mensuel et restent valables 1 an · En payant, vous acceptez les {terms} et la {refund}. Le droit de rétractation peut être limité dès que vous commencez à les utiliser.","terms":"Conditions d'utilisation","terms_sub":"Conditions du service","refund":"Politique de remboursement","refund_sub":"Résiliation et remboursements","plan_notice":"Prélèvement mensuel à la même date · Résiliable à tout moment · En payant, vous acceptez les {terms} et la {refund}. Le droit de rétractation peut être limité une fois le quota payant utilisé.","past_due":"Échec du paiement automatique — vérifiez votre carte. Nous réessaierons jusqu'au {date}, puis vous passerez à l'offre gratuite","resubscribe":"S'abonner avec une autre carte","next":"Prochain paiement {date}","cancel":"Résilier l'abonnement","canceled":"Résilié · actif jusqu'au {date}","resume":"Annuler la résiliation","cancel_confirm":"Résilier votre abonnement ?\n\nVous gardez votre offre actuelle jusqu'au {date}, puis plus aucun prélèvement.","cancel_done":"Résilié. Vous pouvez utiliser votre offre jusqu'au {date}.","resume_done":"Résiliation annulée. Le prélèvement aura lieu à la prochaine échéance.","login_agree":"En vous inscrivant, vous acceptez les {terms} et la {privacy}.","privacy":"Politique de confidentialité"},
  de:{"pack_notice":"Einmalzahlung · Keine automatische Verlängerung · Aufgeladene Zeichen werden nach deinem Monatskontingent genutzt und gelten 1 Jahr ab Kauf · Mit der Zahlung stimmst du den {terms} und der {refund} zu. Das Widerrufsrecht kann eingeschränkt sein, sobald du sie nutzt.","terms":"Nutzungsbedingungen","terms_sub":"Bedingungen der Nutzung","refund":"Erstattungsrichtlinie","refund_sub":"Kündigung und Erstattungen","plan_notice":"Monatliche Abbuchung am selben Tag · Jederzeit kündbar · Mit der Zahlung stimmst du den {terms} und der {refund} zu. Das Widerrufsrecht kann eingeschränkt sein, sobald du das bezahlte Kontingent nutzt.","past_due":"Automatische Zahlung fehlgeschlagen — bitte prüfe deine Karte. Wir versuchen es bis {date} erneut, danach wechselst du zu Kostenlos","resubscribe":"Mit anderer Karte abonnieren","next":"Nächste Zahlung {date}","cancel":"Abo kündigen","canceled":"Gekündigt · aktiv bis {date}","resume":"Kündigung zurücknehmen","cancel_confirm":"Abo kündigen?\n\nDu behältst deinen aktuellen Tarif bis {date}, danach wird nichts mehr abgebucht.","cancel_done":"Gekündigt. Du kannst deinen Tarif bis {date} nutzen.","resume_done":"Kündigung zurückgenommen. Die Abbuchung erfolgt am nächsten Zahltag.","login_agree":"Mit der Registrierung stimmst du den {terms} und der {privacy} zu.","privacy":"Datenschutzerklärung"},
  vi:{"pack_notice":"Thanh toán một lần · Không tự động gia hạn · Ký tự nạp thêm được dùng sau khi hết hạn mức tháng và có hiệu lực 1 năm từ ngày mua · Khi thanh toán, bạn đồng ý với {terms} và {refund}. Quyền rút lại yêu cầu có thể bị hạn chế khi bạn bắt đầu dùng ký tự nạp thêm.","terms":"Điều khoản dịch vụ","terms_sub":"Điều kiện sử dụng","refund":"Chính sách hoàn tiền","refund_sub":"Hủy gói và hoàn tiền","plan_notice":"Tự động thanh toán vào cùng ngày mỗi tháng · Hủy bất cứ lúc nào · Khi thanh toán, bạn đồng ý với {terms} và {refund}. Quyền rút lại yêu cầu có thể bị hạn chế khi bạn dùng hạn mức trả phí.","past_due":"Thanh toán tự động thất bại — vui lòng kiểm tra thẻ. Chúng tôi sẽ thử lại đến {date}, sau đó bạn sẽ chuyển sang gói miễn phí","resubscribe":"Đăng ký lại bằng thẻ khác","next":"Ngày thanh toán tiếp theo {date}","cancel":"Hủy gói đăng ký","canceled":"Đã hủy · dùng được đến {date}","resume":"Bỏ hủy","cancel_confirm":"Hủy gói đăng ký?\n\nBạn vẫn dùng gói hiện tại đến {date}, sau đó sẽ không bị trừ tiền nữa.","cancel_done":"Đã hủy. Bạn có thể dùng gói đến {date}.","resume_done":"Đã bỏ hủy. Sẽ tự động thanh toán vào ngày thanh toán tiếp theo.","login_agree":"Khi đăng ký, bạn đồng ý với {terms} và {privacy}.","privacy":"Chính sách quyền riêng tư"},
  th:{"pack_notice":"ชำระครั้งเดียว · ไม่ตัดเงินอัตโนมัติ · ตัวอักษรที่เติมจะใช้หลังโควตารายเดือนหมด และใช้ได้ 1 ปีนับจากวันซื้อ · เมื่อชำระเงินถือว่าคุณยอมรับ{terms}และ{refund} เมื่อเริ่มใช้ตัวอักษรที่เติมแล้ว สิทธิ์ยกเลิกคำสั่งซื้ออาจถูกจำกัด","terms":"ข้อกำหนดการใช้งาน","terms_sub":"เงื่อนไขการใช้บริการ","refund":"นโยบายการคืนเงิน","refund_sub":"การยกเลิกและการคืนเงิน","plan_notice":"ตัดเงินอัตโนมัติวันเดียวกันทุกเดือน · ยกเลิกได้ทุกเมื่อ · เมื่อชำระเงินถือว่าคุณยอมรับ{terms}และ{refund} เมื่อใช้โควตาแบบชำระเงินแล้ว สิทธิ์ยกเลิกคำสั่งซื้ออาจถูกจำกัด","past_due":"ตัดเงินอัตโนมัติไม่สำเร็จ — โปรดตรวจสอบบัตร เราจะลองอีกครั้งจนถึง {date} หากยังไม่สำเร็จจะเปลี่ยนเป็นแพ็กเกจฟรี","resubscribe":"สมัครใหม่ด้วยบัตรอื่น","next":"ชำระครั้งถัดไป {date}","cancel":"ยกเลิกการสมัคร","canceled":"ยกเลิกแล้ว · ใช้ได้ถึง {date}","resume":"ยกเลิกการยกเลิก","cancel_confirm":"ต้องการยกเลิกการสมัครหรือไม่?\n\nคุณยังใช้แพ็กเกจปัจจุบันได้ถึง {date} หลังจากนั้นจะไม่มีการตัดเงิน","cancel_done":"ยกเลิกแล้ว ใช้ได้ถึง {date}","resume_done":"ยกเลิกการยกเลิกแล้ว จะตัดเงินอัตโนมัติในวันชำระครั้งถัดไป","login_agree":"เมื่อสมัครสมาชิก ถือว่าคุณยอมรับ{terms}และ{privacy}","privacy":"นโยบายความเป็นส่วนตัว"},
  mn:{"pack_notice":"Нэг удаагийн төлбөр · Автомат төлбөргүй · Цэнэглэсэн тэмдэгт сарын хязгаар дууссаны дараа ашиглагдах бөгөөд худалдан авснаас хойш 1 жил хүчинтэй · Төлбөр төлснөөр {terms} болон {refund}-г зөвшөөрсөнд тооцно. Цэнэглэсэн тэмдэгтийг ашиглаж эхэлбэл захиалгаа цуцлах эрх хязгаарлагдаж болно.","terms":"Үйлчилгээний нөхцөл","terms_sub":"Ашиглалтын нөхцөл","refund":"Буцаан олголтын бодлого","refund_sub":"Захиалга цуцлах, буцаан олгох журам","plan_notice":"Сар бүр ижил өдөр автоматаар төлнө · Хүссэн үедээ цуцална · Төлбөр төлснөөр {terms} болон {refund}-г зөвшөөрсөнд тооцно. Төлбөртэй хязгаараар орчуулга ашигласны дараа захиалгаа цуцлах эрх хязгаарлагдаж болно.","past_due":"Автомат төлбөр амжилтгүй — картаа шалгана уу. {date} хүртэл дахин оролдох ба амжилтгүй бол үнэгүй багц руу шилжинэ","resubscribe":"Өөр картаар дахин захиалах","next":"Дараагийн төлбөр {date}","cancel":"Захиалга цуцлах","canceled":"Цуцалсан · {date} хүртэл ашиглана","resume":"Цуцлалтыг буцаах","cancel_confirm":"Захиалгаа цуцлах уу?\n\n{date} хүртэл одоогийн багцаа ашиглах бөгөөд дараа нь төлбөр авахгүй.","cancel_done":"Цуцаллаа. {date} хүртэл ашиглах боломжтой.","resume_done":"Цуцлалтыг буцаалаа. Дараагийн төлбөрийн өдөр автоматаар төлнө.","login_agree":"Бүртгүүлснээр {terms} болон {privacy}-г зөвшөөрсөнд тооцно.","privacy":"Нууцлалын бодлого"},
  hi:{"pack_notice":"एक बार का भुगतान · अपने-आप नवीनीकरण नहीं · टॉप-अप अक्षर मासिक कोटा खत्म होने के बाद इस्तेमाल होते हैं और खरीद से 1 साल तक मान्य रहते हैं · भुगतान करने पर आप {terms} और {refund} से सहमत होते हैं। टॉप-अप अक्षर इस्तेमाल शुरू करने के बाद रद्द करने का अधिकार सीमित हो सकता है।","terms":"सेवा की शर्तें","terms_sub":"उपयोग की शर्तें","refund":"रिफ़ंड नीति","refund_sub":"सदस्यता रद्द करना और रिफ़ंड","plan_notice":"हर महीने उसी तारीख को अपने-आप भुगतान · कभी भी रद्द करें · भुगतान करने पर आप {terms} और {refund} से सहमत होते हैं। सशुल्क कोटा इस्तेमाल करने के बाद रद्द करने का अधिकार सीमित हो सकता है।","past_due":"अपने-आप भुगतान विफल — कृपया अपना कार्ड जाँचें। हम {date} तक फिर कोशिश करेंगे, उसके बाद आप मुफ़्त प्लान पर चले जाएँगे","resubscribe":"दूसरे कार्ड से फिर सदस्यता लें","next":"अगला भुगतान {date}","cancel":"सदस्यता रद्द करें","canceled":"रद्द · {date} तक सक्रिय","resume":"रद्द करना वापस लें","cancel_confirm":"सदस्यता रद्द करें?\n\n{date} तक आपका मौजूदा प्लान चलेगा, उसके बाद कोई भुगतान नहीं लिया जाएगा।","cancel_done":"रद्द हो गई। आप {date} तक प्लान इस्तेमाल कर सकते हैं।","resume_done":"रद्द करना वापस लिया गया। अगली भुगतान तारीख को अपने-आप भुगतान होगा।","login_agree":"साइन अप करने पर आप {terms} और {privacy} से सहमत होते हैं।","privacy":"गोपनीयता नीति"},
  pt:{"pack_notice":"Pagamento único · Sem renovação automática · Os caracteres recarregados são usados após sua cota mensal e valem 1 ano a partir da compra · Ao pagar, você concorda com os {terms} e a {refund}. O direito de desistência pode ser limitado quando você começar a usá-los.","terms":"Termos de serviço","terms_sub":"Condições de uso","refund":"Política de reembolso","refund_sub":"Cancelamento e reembolsos","plan_notice":"Cobrança mensal no mesmo dia · Cancele quando quiser · Ao pagar, você concorda com os {terms} e a {refund}. O direito de desistência pode ser limitado depois que você usar a cota paga.","past_due":"O pagamento automático falhou — verifique seu cartão. Tentaremos de novo até {date}; depois disso você passa para o plano grátis","resubscribe":"Assinar com outro cartão","next":"Próximo pagamento {date}","cancel":"Cancelar assinatura","canceled":"Cancelada · ativa até {date}","resume":"Desfazer cancelamento","cancel_confirm":"Cancelar sua assinatura?\n\nVocê mantém o plano atual até {date} e depois não será mais cobrado.","cancel_done":"Cancelada. Você pode usar seu plano até {date}.","resume_done":"Cancelamento desfeito. A cobrança será feita na próxima data de pagamento.","login_agree":"Ao se cadastrar, você concorda com os {terms} e a {privacy}.","privacy":"Política de privacidade"},
  ar:{"pack_notice":"دفعة واحدة · بلا تجديد تلقائي · تُستخدم الأحرف المشحونة بعد نفاد حصتك الشهرية وتبقى صالحة لمدة سنة من تاريخ الشراء · بالدفع فإنك توافق على {terms} و{refund}. قد يُقيَّد حق الانسحاب بعد البدء في استخدامها.","terms":"شروط الخدمة","terms_sub":"شروط الاستخدام","refund":"سياسة الاسترداد","refund_sub":"الإلغاء والاسترداد","plan_notice":"دفع تلقائي في اليوم نفسه كل شهر · يمكنك الإلغاء في أي وقت · بالدفع فإنك توافق على {terms} و{refund}. قد يُقيَّد حق الانسحاب بعد استخدام الحصة المدفوعة.","past_due":"فشل الدفع التلقائي — يرجى التحقق من بطاقتك. سنعيد المحاولة حتى {date}، وبعدها تنتقل إلى الخطة المجانية","resubscribe":"الاشتراك ببطاقة أخرى","next":"الدفعة التالية {date}","cancel":"إلغاء الاشتراك","canceled":"أُلغي · نشط حتى {date}","resume":"التراجع عن الإلغاء","cancel_confirm":"هل تريد إلغاء اشتراكك؟\n\nستحتفظ بخطتك الحالية حتى {date}، ولن يتم تحصيل أي مبلغ بعد ذلك.","cancel_done":"تم الإلغاء. يمكنك استخدام خطتك حتى {date}.","resume_done":"تم التراجع عن الإلغاء. سيتم الدفع تلقائيًا في تاريخ الدفع التالي.","login_agree":"بالتسجيل فإنك توافق على {terms} و{privacy}.","privacy":"سياسة الخصوصية"},
  id:{"pack_notice":"Pembayaran sekali · Tanpa perpanjangan otomatis · Karakter isi ulang dipakai setelah kuota bulanan habis dan berlaku 1 tahun sejak pembelian · Dengan membayar, Anda menyetujui {terms} dan {refund}. Hak pembatalan dapat dibatasi setelah Anda mulai memakainya.","terms":"Ketentuan Layanan","terms_sub":"Syarat penggunaan","refund":"Kebijakan Pengembalian Dana","refund_sub":"Pembatalan dan pengembalian dana","plan_notice":"Ditagih otomatis setiap bulan di tanggal yang sama · Bisa dibatalkan kapan saja · Dengan membayar, Anda menyetujui {terms} dan {refund}. Hak pembatalan dapat dibatasi setelah Anda memakai kuota berbayar.","past_due":"Pembayaran otomatis gagal — periksa kartu Anda. Kami akan mencoba lagi hingga {date}; setelah itu Anda pindah ke paket Gratis","resubscribe":"Berlangganan dengan kartu lain","next":"Pembayaran berikutnya {date}","cancel":"Batalkan langganan","canceled":"Dibatalkan · aktif hingga {date}","resume":"Urungkan pembatalan","cancel_confirm":"Batalkan langganan?\n\nAnda tetap memakai paket saat ini hingga {date}, dan setelah itu tidak akan ditagih lagi.","cancel_done":"Dibatalkan. Anda bisa memakai paket hingga {date}.","resume_done":"Pembatalan diurungkan. Tagihan akan dibayar otomatis pada tanggal pembayaran berikutnya.","login_agree":"Dengan mendaftar, Anda menyetujui {terms} dan {privacy}.","privacy":"Kebijakan Privasi"}
};
LEGAL_MSG['zh-TW']={"pack_notice": "一次性付款 · 無自動扣款 · 儲值字數在月額度用完後使用，自購買日起1年有效 · 付款即視為同意{terms}和{refund}。開始使用儲值字數後，撤回申請可能受到限制。", "terms": "使用條款", "terms_sub": "服務使用條件", "refund": "退款政策", "refund_sub": "訂閱取消與退款標準", "plan_notice": "每月同一天自動扣款 · 可隨時取消 · 付款即視為同意{terms}和{refund}。付款後使用付費額度翻譯，撤回申請可能受到限制。", "past_due": "自動扣款失敗 — 請檢查信用卡。我們會重試到{date}，仍失敗將改為免費方案", "resubscribe": "用其他卡重新訂閱", "next": "下次扣款日 {date}", "cancel": "取消訂閱", "canceled": "已取消 · 可使用到{date}", "resume": "撤銷取消", "cancel_confirm": "要取消訂閱嗎？\n\n在{date}之前可以繼續使用目前方案，之後不再扣款。", "cancel_done": "已取消。可以使用到{date}。", "resume_done": "已撤銷取消。將在下次扣款日自動扣款。", "login_agree": "註冊即視為同意{terms}和{privacy}。", "privacy": "隱私權政策"};
LEGAL_MSG.tr={"pack_notice": "Tek seferlik ödeme · Otomatik yenileme yok · Yüklenen karakterler aylık kotanızdan sonra kullanılır ve 1 yıl geçerlidir · Ödeme yaparak {terms} ve {refund} metinlerini kabul etmiş olursunuz. Kullanmaya başladığınızda cayma hakkı sınırlanabilir.", "terms": "Kullanım Koşulları", "terms_sub": "Kullanım şartları", "refund": "İade Politikası", "refund_sub": "İptal ve iadeler", "plan_notice": "Her ay aynı gün faturalandırılır · İstediğiniz zaman iptal edin · Ödeme yaparak {terms} ve {refund} metinlerini kabul etmiş olursunuz. Ücretli kotayı kullandığınızda cayma hakkı sınırlanabilir.", "past_due": "Otomatik ödeme başarısız oldu — lütfen kartınızı kontrol edin. {date} tarihine kadar tekrar deneyeceğiz; sonrasında Ücretsiz plana geçersiniz", "resubscribe": "Başka bir kartla abone ol", "next": "Sonraki ödeme {date}", "cancel": "Aboneliği iptal et", "canceled": "İptal edildi · {date} tarihine kadar etkin", "resume": "İptali geri al", "cancel_confirm": "Aboneliğiniz iptal edilsin mi?\n\nMevcut planınızı {date} tarihine kadar kullanmaya devam edersiniz ve sonrasında ücret alınmaz.", "cancel_done": "İptal edildi. Planınızı {date} tarihine kadar kullanabilirsiniz.", "resume_done": "İptal geri alındı. Sonraki ödeme tarihinde ücretlendirileceksiniz.", "login_agree": "Kaydolarak {terms} ve {privacy} metinlerini kabul etmiş olursunuz.", "privacy": "Gizlilik Politikası"};
function legalMsg(k){const m=LEGAL_MSG[_uiLang]||(_uiLang==='ko'?LEGAL_MSG.ko:LEGAL_MSG.en);return m[k]||LEGAL_MSG.ko[k]||k;}
function openLegal(page){window.open('/'+page+'.html','_blank','noopener');}
function legalLink(page,label){return '<a href="/'+page+'.html" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">'+label+'</a>';}
function fmtBillingDate(ts){
  if(!ts)return '';
  const d=ts.toDate?ts.toDate():new Date(ts.seconds?ts.seconds*1000:ts);
  return d.getFullYear()+'.'+(d.getMonth()+1)+'.'+d.getDate();
}
function renderLegalLabels(){
  document.querySelectorAll('[data-legal]').forEach(function(el){el.textContent=legalMsg(el.getAttribute('data-legal'));});
  const n=document.getElementById('plan-legal-notice');
  if(n)n.innerHTML=legalMsg(onetimeDef(_selectedPlanKey)?'pack_notice':'plan_notice').replace('{terms}',legalLink('terms',legalMsg('terms'))).replace('{refund}',legalLink('refund',legalMsg('refund')));
  const la=document.getElementById('login-legal-agree');
  if(la)la.innerHTML=legalMsg('login_agree').replace('{terms}',legalLink('terms',legalMsg('terms')))
    .replace('{privacy}','<span onclick="showPrivacyPolicy()" style="color:var(--primary);cursor:pointer;text-decoration:underline;">'+legalMsg('privacy')+'</span>');
}
document.addEventListener('DOMContentLoaded',renderLegalLabels);

// 사용량 카드 아래 구독 상태 줄 (웹에서만 — 앱에서는 .web-only 로 숨김)
function renderSubscriptionLine(){
  const el=document.getElementById('usage-sub-line');
  if(!el)return;
  const b=window._myBilling;
  const nb=b&&b.nextBillingAt;
  const active=nb&&((nb.toDate?nb.toDate():new Date(nb.seconds*1000))>new Date());
  const gu=b&&b.status==='past_due'&&b.graceUntil;
  const pastDue=gu&&((gu.toDate?gu.toDate():new Date(gu.seconds*1000))>new Date());
  if((!active&&!pastDue)||isAppMode()){el.style.display='none';el.innerHTML='';return;}
  const date=fmtBillingDate(nb);
  const linkStyle='color:var(--primary);cursor:pointer;text-decoration:underline;font-weight:600;';
  if(pastDue){
    el.innerHTML='<span style="color:var(--error,#ba1a1a);">'+legalMsg('past_due').replace('{date}',fmtBillingDate(gu))+'</span> · <span style="'+linkStyle+'" onclick="showPlanSheet()">'+legalMsg('resubscribe')+'</span>';
  }else if(b.status==='canceled'){
    el.innerHTML=legalMsg('canceled').replace('{date}',date)+' · <span style="'+linkStyle+'" onclick="cancelSubscription(true)">'+legalMsg('resume')+'</span>';
  }else{
    el.innerHTML=legalMsg('next').replace('{date}',date)+' · <span style="'+linkStyle+'" onclick="cancelSubscription(false)">'+legalMsg('cancel')+'</span>';
  }
  el.style.display='';
}
async function cancelSubscription(resume){
  if(isAppMode()||!currentUser)return;
  const date=fmtBillingDate(window._myBilling&&window._myBilling.nextBillingAt);
  if(!resume&&!confirm(legalMsg('cancel_confirm').replace('{date}',date)))return;
  try{
    await billingFetch('/cancel',{resume:!!resume});
    showToast(resume?legalMsg('resume_done'):legalMsg('cancel_done').replace('{date}',date));
  }catch(e){
    showToast(billingMsg('fail')+(e&&e.message?': '+e.message:''));
  }
  renderUsageUI();
}

// settings 탭 전환 시 사용량 렌더
// PWA
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('/sw.js')
      .then(function(reg){console.log('SW 등록 완료');})
      .catch(function(err){console.log('SW 등록 실패:',err);});
  });
}

var MANDU_LOGO_HTML='<svg width="64" height="64" viewBox="0 0 200 200" aria-hidden="true"><use href="#mandu-logo"/></svg>';
