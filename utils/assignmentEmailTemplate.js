const assignmentEmailTemplate = ({
    member,
    event,
    department,
    assignment,
    confirmUrl,
    declineUrl,
  }) => {
    const memberName = `${member.firstName || ""} ${
      member.lastName || ""
    }`.trim();
  
    const eventDate = event.date
      ? new Date(event.date).toLocaleString("fr-FR")
      : "Date non précisée";
  
    return `
      <div style="
        max-width: 650px;
        margin: auto;
        font-family: Arial, sans-serif;
        background: #f8fafc;
        padding: 30px;
      ">
  
        <div style="
          background: white;
          border-radius: 18px;
          padding: 32px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.06);
        ">
  
          <div style="margin-bottom: 25px;">
            <h2 style="margin:0;color:#111827;">
              ElDior Management Church
            </h2>
  
            <p style="color:#64748b;">
              Nouvelle programmation
            </p>
          </div>
  
          <p>Bonjour <strong>${memberName}</strong>,</p>
  
          <p>
            Vous avez été programmé(e) pour participer à l’événement suivant :
          </p>
  
          <div style="
            background:#f8fafc;
            padding:20px;
            border-radius:12px;
            margin:20px 0;
          ">
  
            <p>
              <strong>Événement :</strong>
              ${event.title || "-"}
            </p>
  
            <p>
              <strong>Date :</strong>
              ${eventDate}
            </p>
  
            <p>
              <strong>Lieu :</strong>
              ${event.location || "-"}
            </p>
  
            <p>
              <strong>Département :</strong>
              ${department?.name || "-"}
            </p>
  
            <p>
              <strong>Votre poste :</strong>
              ${assignment.role || "-"}
            </p>
  
            ${
              assignment.note
                ? `
                  <p>
                    <strong>Consignes :</strong>
                    ${assignment.note}
                  </p>
                `
                : ""
            }
  
          </div>
  
          <p>
            Merci de nous confirmer votre disponibilité :
          </p>
  
          <div style="
            margin-top:25px;
            display:flex;
            gap:12px;
            flex-wrap:wrap;
          ">
  
            <a
              href="${confirmUrl}"
              style="
                background:#16a34a;
                color:white;
                padding:13px 22px;
                border-radius:10px;
                text-decoration:none;
                font-weight:bold;
              "
            >
              Je confirme
            </a>
  
            <a
              href="${declineUrl}"
              style="
                background:#dc2626;
                color:white;
                padding:13px 22px;
                border-radius:10px;
                text-decoration:none;
                font-weight:bold;
              "
            >
              Je ne suis pas disponible
            </a>
  
          </div>
  
          <p style="
            margin-top:30px;
            font-size:13px;
            color:#94a3b8;
          ">
            Ce message a été envoyé automatiquement par ElDior Management Church.
          </p>
  
        </div>
      </div>
    `;
  };
  
  module.exports = assignmentEmailTemplate;