# tasks-1
## Ziel
Eine App, in der ich alle meine TODOs und Aufgaben verwalten kann.

## Anforderungen/Ideen
- Ich werde per Notification benachrichtigt, wenn ein Task ausgeführt werden soll/muss/kann.
- Ich kann Tasks hinzufügen und ansehen, auch wenn ich offline bin.
- Tasks haben einen Titel und eine optionale Beschriebung bzw. Details.
- Die App ist durch eine Authentifizierungs-Logik geschützt.
- Es gibt eine Inbox, in der Tasks landen können, die nur sehr schnell nebenbei hinzugefägt wurden und die noch nicht vollständig eingearbeitet sind.
- Ich werde jeden Abend aufgefordert, die Inbox zu leeren, indem ich Tasks "richtig" einsortiere.
- In die Inbox können Tasks sehr schnell eingefügt werden: Entweder per Keyboard (so wenige Klicks wie möglich), per Sprachbefehl (Siri shortcut direkt vom Sperrbildschirm meines iPhones) oder auch über einen Webhook (den ich z.B. mit einem Telegram Bot nutzen kann).
- Tasks können einmalig oder wiederkehrend sein.
- Wiederkehrende Tasks können eine "Abstandsregel" (alle X Tage/Wochen) oder einen "Zeitplan" (jeden Mittwoch und Samstag) haben
- Es soll verschiedene Ansichten geben, um alles Wichtige im Blick zu behalten: Die Hauptansichten sind (a) was kann ich gerade tun? und (b) was muss ich gerade tun?
- Tasks können voneinander abhängen bzw. voneinander geblockt sein, so dass ein Task beendet sein muss, bevor der nächste starten kann
- Tasks können von externen Personen abhängen, so dass ich warten muss (und evtl. irgendwann nachhaken, wenn bis zu einem bestimmten Zeitpunkt nichts passiert ist)
- Tasks können entwder jederzeit fällig sein oder einen bestimmten Fälligkeitszeitpunkt haben
- Es soll "Spaces" von Tasks geben, die unabhängig sind und individuell zwischen Nutzern geteilt/synchronisiert werden können (ein Nutzer kann einen Space erstellen und dann über eine ID teilen)
- In jedem Space soll es Listen/Kategorien geben, die jeweils eine Farbe und ein (optionales) Icon haben
- Die Haupt-Aktionen sollen so einfach und schnell wie möglich ausführbar sein
