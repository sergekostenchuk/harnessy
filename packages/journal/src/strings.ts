export const PROTOCOL_VERSION=1;
export const PROTOCOL_TEXT='Протокол линии харнесса, версия 1. Одна запись — одна строка JSON, только дописывание. '+
'Поля: seq (сквозной номер, выдаёт сервер), id, ts, from (место-отправитель, ставит сервер), '+
'to (список мест или *), kind (закрытый список), thread (предмет обсуждения), reply_to (seq записи, '+
'на которую отвечают), text, evidence (пути к свидетельствам), policy (версия правил связи). '+
'Записи доставляются адресатам по курсорам: место получает всё адресованное ему, чего ещё не видело, '+
'одним входящим сообщением, когда свободно. Ответ на question — answer, на task — status, '+
'на review-request — verdict с полями score и round. Владелец — место owner с полным правом.';
export const POLICY_BROKEN='политика связи не читается; исправь comms-policy.yaml';
export const POLICY_BROKEN_REASON='политика связи не читается — записи агентов не проходят';
export const SCORE_INVALID='verdict требует score — целое от 0 до 10';
export const ROUND_INVALID='verdict требует round — целое от 1';
export const REPLY_REQUIRED='verdict — только ответ на review-request (reply_to)';
export const SHA_REQUIRED='review-request обязан нести sha коммита вехи (git rev-parse HEAD в своей ветке)';
export const EVIDENCE_REQUIRED='verdict без отчёта не принимается: положи report.md в .harness/evidence/<тред>/r<раунд>/ и укажи путь в evidence';
