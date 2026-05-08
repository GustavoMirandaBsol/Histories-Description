import { useEffect, useMemo, useRef, useState } from "react";
import {
  cloudSyncEnabled,
  loadSharedProject,
  saveSharedProject,
  subscribeToSharedProject
} from "./cloudSync";

const STORAGE_KEY = "mapa-metodos-data-v1";
const ROOT_VALUE = "__root__";
const STATUS = ["Pendiente", "En progreso", "Validado", "Completado", "Bloqueado"];
const EMPTY_METHODS = [];

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createMethod(projectId, name, parentId = null, overrides = {}) {
  return {
    id: createId("method"),
    projectId,
    parentId,
    name,
    requirement: "",
    notes: "",
    status: "Pendiente",
    links: [],
    images: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides
  };
}

function createExecuteDemoProject() {
  const projectId = createId("project");
  const execute = createMethod(projectId, "execute", null, {
    requirement: "Orquestar el flujo completo de desembolso.",
    notes: "Método principal del proceso.",
    status: "En progreso"
  });
  const initDisbursement = createMethod(projectId, "InitDisbursement", execute.id, {
    requirement: "Preparar la operación antes de consultar datos y documentos.",
    status: "En progreso"
  });
  const getClient = createMethod(projectId, "Get Client", initDisbursement.id, {
    requirement: "Obtener y validar la información del cliente."
  });
  const getDocument = createMethod(projectId, "Get Document", initDisbursement.id, {
    requirement: "Recuperar los documentos necesarios para continuar.",
    status: "Completado"
  });

  return {
    id: projectId,
    name: "Flujo de desembolso",
    description: "Ejemplo gráfico: execute > InitDisbursement > Get Client / Get Document.",
    collaborators: [
      {
        id: createId("collaborator"),
        email: "arquitectura@example.com",
        addedAt: nowIso()
      }
    ],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    methods: [execute, initDisbursement, getClient, getDocument]
  };
}

function normalizeProjects(projects) {
  return projects
    .filter((project) => project?.id && project?.name)
    .map((project) => {
      const normalizedProject = {
        id: project.id,
        name: project.name,
        description: project.description ?? "",
        collaborators: Array.isArray(project.collaborators)
          ? project.collaborators
              .filter((collaborator) => collaborator?.email)
              .map((collaborator) => ({
                id: collaborator.id ?? createId("collaborator"),
                email: normalizeEmail(collaborator.email),
                addedAt: collaborator.addedAt ?? nowIso()
              }))
          : [],
        createdAt: project.createdAt ?? nowIso(),
        updatedAt: project.updatedAt ?? nowIso(),
        methods: []
      };

      normalizedProject.methods = (project.methods ?? [])
        .filter((method) => method?.id && method?.name)
        .map((method) => ({
          id: method.id,
          projectId: normalizedProject.id,
          parentId: method.parentId ?? null,
          name: method.name,
          requirement: method.requirement ?? "",
          notes: method.notes ?? "",
          status: STATUS.includes(method.status) ? method.status : "Pendiente",
          links: Array.isArray(method.links) ? method.links : [],
          images: Array.isArray(method.images) ? method.images : [],
          createdAt: method.createdAt ?? nowIso(),
          updatedAt: method.updatedAt ?? nowIso()
        }));

      const methodIds = new Set(normalizedProject.methods.map((method) => method.id));
      normalizedProject.methods = normalizedProject.methods.map((method) => ({
        ...method,
        parentId: method.parentId && methodIds.has(method.parentId) ? method.parentId : null
      }));

      return normalizedProject;
    });
}

function normalizeProject(project) {
  return normalizeProjects([project])[0] ?? null;
}

function loadInitialState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const projects = normalizeProjects(stored.projects ?? []);
    if (projects.length === 0) {
      const demoProject = createExecuteDemoProject();
      return {
        projects: [demoProject],
        selectedProjectId: demoProject.id,
        selectedMethodId: demoProject.methods[0].id
      };
    }

    const selectedProjectId = projects.some((project) => project.id === stored.selectedProjectId)
      ? stored.selectedProjectId
      : projects[0].id;
    const selectedProject = projects.find((project) => project.id === selectedProjectId);
    const selectedMethodId = selectedProject?.methods.some((method) => method.id === stored.selectedMethodId)
      ? stored.selectedMethodId
      : selectedProject?.methods[0]?.id ?? null;

    return { projects, selectedProjectId, selectedMethodId };
  } catch {
    const demoProject = createExecuteDemoProject();
    return {
      projects: [demoProject],
      selectedProjectId: demoProject.id,
      selectedMethodId: demoProject.methods[0].id
    };
  }
}

function sortByCreated(items) {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function makeChildrenMap(methods) {
  const map = new Map();
  methods.forEach((method) => {
    const key = method.parentId ?? ROOT_VALUE;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(method);
  });

  map.forEach((children, key) => {
    map.set(key, sortByCreated(children));
  });

  return map;
}

function getDescendantIds(methods, parentId) {
  const childrenMap = makeChildrenMap(methods);
  const result = [];

  function visit(id) {
    (childrenMap.get(id) ?? []).forEach((child) => {
      result.push(child.id);
      visit(child.id);
    });
  }

  visit(parentId);
  return result;
}

function getMethodPath(methods, methodId) {
  const methodMap = new Map(methods.map((method) => [method.id, method]));
  const path = [];
  let cursor = methodMap.get(methodId);

  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parentId ? methodMap.get(cursor.parentId) : null;
  }

  return path;
}

function methodMatchesSearch(method, query) {
  if (!query) return true;

  const text = [
    method.name,
    method.requirement,
    method.notes,
    ...method.links.map((link) => `${link.title} ${link.url}`)
  ]
    .join(" ")
    .toLowerCase();

  return text.includes(query.toLowerCase());
}

function cleanMethodLine(line) {
  return line.replace(/^\s*[-*]*\s*(?:-+>|>+)?\s*/, "").trim();
}

function normalizeUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function getSharedProjectIdFromUrl() {
  return new URLSearchParams(window.location.search).get("project");
}

function sharedProjectUrl(projectId) {
  const url = new URL(window.location.href);
  url.searchParams.set("project", projectId);
  return url.toString();
}

export default function App() {
  const initialState = useMemo(loadInitialState, []);
  const initialSharedProjectId = useMemo(getSharedProjectIdFromUrl, []);
  const applyingRemoteUpdateRef = useRef(false);
  const saveTimerRef = useRef(null);
  const [projects, setProjects] = useState(initialState.projects);
  const [selectedProjectId, setSelectedProjectId] = useState(initialState.selectedProjectId);
  const [selectedMethodId, setSelectedMethodId] = useState(initialState.selectedMethodId);
  const [syncStatus, setSyncStatus] = useState(cloudSyncEnabled ? "Conectando" : "Modo local");
  const [syncMessage, setSyncMessage] = useState(
    cloudSyncEnabled
      ? "La sincronización compartida está disponible."
      : "Configura Supabase para ver cambios de otros colaboradores."
  );
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [methodSearch, setMethodSearch] = useState("");
  const [newMethodName, setNewMethodName] = useState("");
  const [newMethodParentId, setNewMethodParentId] = useState(ROOT_VALUE);
  const [methodDraft, setMethodDraft] = useState({
    name: "",
    status: "Pendiente",
    requirement: "",
    notes: ""
  });
  const [singleChildName, setSingleChildName] = useState("");
  const [bulkChildren, setBulkChildren] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [collaboratorEmail, setCollaboratorEmail] = useState("");

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const selectedMethods = selectedProject?.methods ?? EMPTY_METHODS;
  const selectedMethod = useMemo(
    () => selectedMethods.find((method) => method.id === selectedMethodId) ?? null,
    [selectedMethodId, selectedMethods]
  );

  const childrenMap = useMemo(() => makeChildrenMap(selectedMethods), [selectedMethods]);
  const searchMatchIds = useMemo(
    () =>
      new Set(
        selectedMethods
          .filter((method) => methodMatchesSearch(method, methodSearch))
          .map((method) => method.id)
      ),
    [methodSearch, selectedMethods]
  );
  const rootMethods = useMemo(
    () => childrenMap.get(ROOT_VALUE) ?? [],
    [childrenMap]
  );
  const methodOptions = useMemo(() => {
    if (!selectedProjectId) return [];
    return selectedMethods.map((method) => ({
      id: method.id,
      label: getMethodPath(selectedMethods, method.id)
        .map((item) => item.name)
        .join(" / ")
    }));
  }, [selectedMethods, selectedProjectId]);
  const directChildren = selectedMethod ? childrenMap.get(selectedMethod.id) ?? [] : [];

  useEffect(() => {
    if (!cloudSyncEnabled) return;
    if (!initialSharedProjectId) {
      setSyncStatus("Listo para compartir");
      setSyncMessage("Copia el enlace colaborativo del proyecto para que otros editen el mismo flujo.");
      return;
    }

    let cancelled = false;
    setSyncStatus("Cargando nube");
    setSyncMessage("Buscando el proyecto compartido del enlace.");

    loadSharedProject(initialSharedProjectId)
      .then((sharedProject) => {
        if (cancelled) return;
        const normalizedProject = normalizeProject(sharedProject);
        if (!normalizedProject) {
          setSyncStatus("Sin datos compartidos");
          setSyncMessage("No existe un flujo publicado para este enlace. Se creará al guardar cambios.");
          setSelectedProjectId(initialSharedProjectId);
          return;
        }

        applyingRemoteUpdateRef.current = true;
        replaceOrInsertProject(normalizedProject);
        setSelectedProjectId(normalizedProject.id);
        setSelectedMethodId(normalizedProject.methods[0]?.id ?? null);
        setSyncStatus("Sincronizado");
        setSyncMessage("Este flujo ya está cargado desde la nube.");
      })
      .catch((error) => {
        if (cancelled) return;
        setSyncStatus("Error de nube");
        setSyncMessage(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [initialSharedProjectId]);

  useEffect(() => {
    if (!cloudSyncEnabled || !selectedProjectId) return;

    const unsubscribe = subscribeToSharedProject(
      selectedProjectId,
      (sharedProject) => {
        const normalizedProject = normalizeProject(sharedProject);
        if (!normalizedProject) return;

        applyingRemoteUpdateRef.current = true;
        replaceOrInsertProject(normalizedProject);
        setSyncStatus("Actualizado");
        setSyncMessage("Se recibió un cambio de otro navegador o colaborador.");
      },
      (error) => {
        setSyncStatus("Error de realtime");
        setSyncMessage(error.message);
      }
    );

    return unsubscribe;
  }, [selectedProjectId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          projects,
          selectedProjectId,
          selectedMethodId
        })
      );
    } catch {
      alert("No se pudo guardar. Reduce el tamaño o la cantidad de imágenes y vuelve a intentar.");
    }

    if (!cloudSyncEnabled || !selectedProject) return;
    if (applyingRemoteUpdateRef.current) {
      applyingRemoteUpdateRef.current = false;
      return;
    }

    window.clearTimeout(saveTimerRef.current);
    setSyncStatus("Guardando");
    setSyncMessage("Sincronizando cambios del proyecto seleccionado.");
    saveTimerRef.current = window.setTimeout(() => {
      saveSharedProject(selectedProject)
        .then(() => {
          setSyncStatus("Sincronizado");
          setSyncMessage("Los cambios están disponibles para tus colaboradores.");
        })
        .catch((error) => {
          setSyncStatus("Error al guardar");
          setSyncMessage(error.message);
        });
    }, 450);

    return () => window.clearTimeout(saveTimerRef.current);
  }, [projects, selectedMethodId, selectedProjectId, selectedProject]);

  useEffect(() => {
    const activeProject = projects.find((project) => project.id === selectedProjectId) ?? null;

    if (!activeProject && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
      return;
    }

    if (!activeProject) {
      setSelectedMethodId(null);
      return;
    }

    if (selectedMethodId && activeProject.methods.some((method) => method.id === selectedMethodId)) {
      return;
    }

    setSelectedMethodId(activeProject.methods[0]?.id ?? null);
  }, [projects, selectedMethodId, selectedProjectId]);

  useEffect(() => {
    setNewMethodParentId(selectedMethodId ?? ROOT_VALUE);
  }, [selectedMethodId, selectedProjectId]);

  useEffect(() => {
    if (!selectedMethod) {
      setMethodDraft({
        name: "",
        status: "Pendiente",
        requirement: "",
        notes: ""
      });
      return;
    }

    setMethodDraft({
      name: selectedMethod.name,
      status: selectedMethod.status,
      requirement: selectedMethod.requirement,
      notes: selectedMethod.notes
    });
  }, [selectedMethod]);

  function replaceOrInsertProject(project) {
    setProjects((current) => {
      const exists = current.some((item) => item.id === project.id);
      if (exists) {
        return current.map((item) => (item.id === project.id ? project : item));
      }
      return [project, ...current];
    });
  }

  function updateSelectedProject(updater) {
    if (!selectedProjectId) return;
    setProjects((current) =>
      current.map((project) =>
        project.id === selectedProjectId
          ? {
              ...updater(project),
              updatedAt: nowIso()
            }
          : project
      )
    );
  }

  function handleCreateProject(event) {
    event.preventDefault();
    const cleanName = projectName.trim();
    if (!cleanName) return;

    const project = {
      id: createId("project"),
      name: cleanName,
      description: projectDescription.trim(),
      collaborators: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      methods: []
    };

    setProjects((current) => [project, ...current]);
    setSelectedProjectId(project.id);
    setSelectedMethodId(null);
    setProjectName("");
    setProjectDescription("");
  }

  function handleAddCollaborator(event) {
    event.preventDefault();
    if (!selectedProject) return;

    const email = normalizeEmail(collaboratorEmail);
    if (!isValidEmail(email)) {
      alert("Ingresa un correo válido para el colaborador.");
      return;
    }

    const exists = selectedProject.collaborators.some((collaborator) => collaborator.email === email);
    if (exists) {
      alert("Ese correo ya está agregado como colaborador.");
      return;
    }

    updateSelectedProject((project) => ({
      ...project,
      collaborators: [
        ...project.collaborators,
        {
          id: createId("collaborator"),
          email,
          addedAt: nowIso()
        }
      ]
    }));
    setCollaboratorEmail("");
    if (!cloudSyncEnabled) {
      setSyncStatus("Modo local");
      setSyncMessage("El correo quedó guardado solo en este navegador. Configura Supabase para compartir cambios.");
    }
  }

  async function handleCopySharedLink() {
    if (!selectedProject) return;

    const url = sharedProjectUrl(selectedProject.id);
    try {
      await navigator.clipboard.writeText(url);
      setSyncMessage("Enlace colaborativo copiado. Envíalo a tus colaboradores para editar el mismo flujo.");
    } catch {
      prompt("Copia este enlace colaborativo:", url);
    }
  }

  function handleDeleteCollaborator(collaboratorId) {
    updateSelectedProject((project) => ({
      ...project,
      collaborators: project.collaborators.filter((collaborator) => collaborator.id !== collaboratorId)
    }));
  }

  function handleDeleteProject() {
    if (!selectedProject) return;
    const ok = confirm(`Eliminar el proyecto "${selectedProject.name}" y todos sus métodos?`);
    if (!ok) return;

    const remaining = projects.filter((project) => project.id !== selectedProject.id);
    setProjects(remaining);
    setSelectedProjectId(remaining[0]?.id ?? null);
    setSelectedMethodId(remaining[0]?.methods[0]?.id ?? null);
  }

  function handleCreateMethod(event) {
    event.preventDefault();
    if (!selectedProject) return;

    const cleanName = newMethodName.trim();
    if (!cleanName) return;

    const parentId = newMethodParentId === ROOT_VALUE ? null : newMethodParentId;
    const method = createMethod(selectedProject.id, cleanName, parentId);

    updateSelectedProject((project) => ({
      ...project,
      methods: [...project.methods, method]
    }));
    setSelectedMethodId(method.id);
    setNewMethodName("");
  }

  function handleCreateChild(name, keepParentSelected = true) {
    if (!selectedProject || !selectedMethod) return;
    const cleanName = name.trim();
    if (!cleanName) return;

    const method = createMethod(selectedProject.id, cleanName, selectedMethod.id);
    updateSelectedProject((project) => ({
      ...project,
      methods: [...project.methods, method]
    }));
    setSelectedMethodId(keepParentSelected ? selectedMethod.id : method.id);
  }

  function handleCreateBulkChildren() {
    if (!selectedProject || !selectedMethod) return;
    const names = bulkChildren.split(/\r?\n/).map(cleanMethodLine).filter(Boolean);
    if (names.length === 0) return;

    const newMethods = names.map((name) => createMethod(selectedProject.id, name, selectedMethod.id));
    updateSelectedProject((project) => ({
      ...project,
      methods: [...project.methods, ...newMethods]
    }));
    setSelectedMethodId(selectedMethod.id);
    setBulkChildren("");
  }

  function handleCreateExecuteExample() {
    if (!selectedProject) return;

    const execute = createMethod(selectedProject.id, "execute", null, {
      requirement: "Orquestar el flujo completo de desembolso.",
      notes: "Método principal del proceso.",
      status: "En progreso"
    });
    const init = createMethod(selectedProject.id, "InitDisbursement", execute.id, {
      requirement: "Preparar la operación antes de consultar datos y documentos.",
      status: "En progreso"
    });
    const client = createMethod(selectedProject.id, "Get Client", init.id, {
      requirement: "Obtener y validar la información del cliente."
    });
    const document = createMethod(selectedProject.id, "Get Document", init.id, {
      requirement: "Recuperar los documentos necesarios para continuar.",
      status: "Completado"
    });

    updateSelectedProject((project) => ({
      ...project,
      methods: [...project.methods, execute, init, client, document]
    }));
    setSelectedMethodId(execute.id);
  }

  function handleSaveMethod(event) {
    event.preventDefault();
    if (!selectedMethod) return;

    updateSelectedProject((project) => ({
      ...project,
      methods: project.methods.map((method) =>
        method.id === selectedMethod.id
          ? {
              ...method,
              name: methodDraft.name.trim() || method.name,
              status: methodDraft.status,
              requirement: methodDraft.requirement.trim(),
              notes: methodDraft.notes.trim(),
              updatedAt: nowIso()
            }
          : method
      )
    }));
  }

  function handleDeleteMethod() {
    if (!selectedProject || !selectedMethod) return;

    const descendants = getDescendantIds(selectedProject.methods, selectedMethod.id);
    const ok = confirm(`Eliminar "${selectedMethod.name}" y ${descendants.length} dependencia(s)?`);
    if (!ok) return;

    const idsToDelete = new Set([selectedMethod.id, ...descendants]);
    const remaining = selectedProject.methods.filter((method) => !idsToDelete.has(method.id));

    updateSelectedProject((project) => ({
      ...project,
      methods: remaining
    }));
    setSelectedMethodId(remaining[0]?.id ?? null);
  }

  function handleAddImages(files) {
    if (!selectedProject || !selectedMethod || files.length === 0) return;

    [...files].forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        updateSelectedProject((project) => ({
          ...project,
          methods: project.methods.map((method) =>
            method.id === selectedMethod.id
              ? {
                  ...method,
                  images: [
                    ...method.images,
                    {
                      id: createId("image"),
                      name: file.name,
                      src: reader.result,
                      addedAt: nowIso()
                    }
                  ],
                  updatedAt: nowIso()
                }
              : method
          )
        }));
      };
      reader.readAsDataURL(file);
    });
  }

  function handleDeleteImage(imageId) {
    if (!selectedMethod) return;
    updateSelectedProject((project) => ({
      ...project,
      methods: project.methods.map((method) =>
        method.id === selectedMethod.id
          ? {
              ...method,
              images: method.images.filter((image) => image.id !== imageId),
              updatedAt: nowIso()
            }
          : method
      )
    }));
  }

  function handleAddLink(event) {
    event.preventDefault();
    if (!selectedMethod || !linkUrl.trim()) return;

    const cleanUrl = normalizeUrl(linkUrl.trim());
    updateSelectedProject((project) => ({
      ...project,
      methods: project.methods.map((method) =>
        method.id === selectedMethod.id
          ? {
              ...method,
              links: [
                ...method.links,
                {
                  id: createId("link"),
                  title: linkTitle.trim() || cleanUrl,
                  url: cleanUrl
                }
              ],
              updatedAt: nowIso()
            }
          : method
      )
    }));

    setLinkTitle("");
    setLinkUrl("");
  }

  function handleDeleteLink(linkId) {
    if (!selectedMethod) return;
    updateSelectedProject((project) => ({
      ...project,
      methods: project.methods.map((method) =>
        method.id === selectedMethod.id
          ? {
              ...method,
              links: method.links.filter((link) => link.id !== linkId),
              updatedAt: nowIso()
            }
          : method
      )
    }));
  }

  function handleExportData() {
    const payload = JSON.stringify({ exportedAt: nowIso(), projects }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mapa-metodos-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleImportData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const importedProjects = normalizeProjects(parsed.projects ?? []);
        if (importedProjects.length === 0) {
          alert("El archivo no contiene proyectos válidos.");
          return;
        }

        setProjects(importedProjects);
        setSelectedProjectId(importedProjects[0].id);
        setSelectedMethodId(importedProjects[0].methods[0]?.id ?? null);
      } catch {
        alert("No se pudo leer el JSON. Revisa el archivo e inténtalo otra vez.");
      }
    };
    reader.readAsText(file);
  }

  function handleResetDemo() {
    const ok = confirm("Cargar el demo reemplazará la información actual. Continuar?");
    if (!ok) return;

    const demoProject = createExecuteDemoProject();
    setProjects([demoProject]);
    setSelectedProjectId(demoProject.id);
    setSelectedMethodId(demoProject.methods[0].id);
  }

  const filteredProjects = projects.filter((project) =>
    `${project.name} ${project.description}`.toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <div className="app-shell">
      <aside className="projects-panel" aria-label="Proyectos">
        <div className="panel-header">
          <div>
            <p className="eyebrow">React</p>
            <h1>Mapa de Métodos</h1>
          </div>
          <button className="icon-button" type="button" onClick={handleExportData} title="Exportar datos">
            ↓
          </button>
        </div>

        <form className="quick-form" onSubmit={handleCreateProject}>
          <label htmlFor="projectName">Nuevo proyecto</label>
          <div className="inline-action">
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Ej. Flujos API"
              autoComplete="off"
              required
            />
            <button type="submit">Crear</button>
          </div>
          <textarea
            value={projectDescription}
            onChange={(event) => setProjectDescription(event.target.value)}
            placeholder="Descripción breve"
          />
        </form>

        <div className="import-row">
          <label className="ghost-button" htmlFor="importDataInput">
            Importar JSON
          </label>
          <input
            id="importDataInput"
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const [file] = event.target.files;
              if (file) handleImportData(file);
              event.target.value = "";
            }}
          />
          <button className="ghost-button danger" type="button" onClick={handleResetDemo}>
            Demo
          </button>
        </div>

        <div className="search-box">
          <label htmlFor="projectSearch">Buscar proyecto</label>
          <input
            id="projectSearch"
            type="search"
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
            placeholder="Nombre, descripción..."
          />
        </div>

        <ul className="project-list">
          {filteredProjects.length === 0 && <li className="empty-list">No hay proyectos que coincidan.</li>}
          {filteredProjects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className={`project-item ${project.id === selectedProjectId ? "active" : ""}`}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setSelectedMethodId(project.methods[0]?.id ?? null);
                }}
              >
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.description || "Sin descripción"}</small>
                </span>
                <em>{project.methods.length}</em>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="workspace">
        <section className="top-bar">
          <div>
            <p className="eyebrow">{selectedProject ? `${selectedProject.methods.length} método(s)` : "Sin proyecto"}</p>
            <h2>{selectedProject?.name ?? "Crea o elige un proyecto"}</h2>
            <p>
              {selectedProject?.description ??
                "Crea métodos principales y conecta submetodos para visualizar el árbol de dependencias."}
            </p>
          </div>
          <div className="project-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={handleCopySharedLink}
              disabled={!selectedProject}
            >
              Copiar enlace colaborativo
            </button>
            <button
              className="ghost-button danger"
              type="button"
              onClick={handleDeleteProject}
              disabled={!selectedProject}
            >
              Eliminar proyecto
            </button>
          </div>
        </section>

        <section className="collaborators-panel" aria-label="Colaboradores del proyecto">
          <div>
            <p className="eyebrow">Colaboradores</p>
            <h3>{selectedProject?.collaborators.length ?? 0} correo(s)</h3>
            <p className="sync-status" data-enabled={cloudSyncEnabled ? "true" : "false"}>
              {syncStatus}: {syncMessage}
            </p>
          </div>
          <form className="collaborator-form" onSubmit={handleAddCollaborator}>
            <input
              type="email"
              value={collaboratorEmail}
              onChange={(event) => setCollaboratorEmail(event.target.value)}
              placeholder="correo@empresa.com"
              autoComplete="email"
              disabled={!selectedProject}
              required
            />
            <button type="submit" disabled={!selectedProject}>
              Agregar
            </button>
          </form>
          <ul className="collaborator-list">
            {!selectedProject && <li className="empty-list">Selecciona un proyecto para agregar colaboradores.</li>}
            {selectedProject?.collaborators.length === 0 && (
              <li className="empty-list">Aún no hay colaboradores en este proyecto.</li>
            )}
            {selectedProject?.collaborators.map((collaborator) => (
              <li key={collaborator.id}>
                <span>{collaborator.email}</span>
                <button
                  className="ghost-button danger"
                  type="button"
                  onClick={() => handleDeleteCollaborator(collaborator.id)}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="content-grid">
          <section className="tree-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Dependencias</p>
                <h3>Árbol gráfico</h3>
              </div>
              <button type="button" onClick={handleCreateExecuteExample} disabled={!selectedProject}>
                Ejemplo Execute
              </button>
            </div>

            <form className="method-create-form" onSubmit={handleCreateMethod}>
              <div>
                <label htmlFor="newMethodName">Nuevo método</label>
                <input
                  id="newMethodName"
                  type="text"
                  value={newMethodName}
                  onChange={(event) => setNewMethodName(event.target.value)}
                  placeholder="Ej. InitDisbursement"
                  autoComplete="off"
                  disabled={!selectedProject}
                  required
                />
              </div>
              <div>
                <label htmlFor="newMethodParent">Depende de</label>
                <select
                  id="newMethodParent"
                  value={newMethodParentId}
                  onChange={(event) => setNewMethodParentId(event.target.value)}
                  disabled={!selectedProject}
                >
                  <option value={ROOT_VALUE}>Método principal</option>
                  {methodOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={!selectedProject}>
                Agregar
              </button>
            </form>

            <div className="toolbar">
              <div>
                <label htmlFor="methodSearch">Buscar en el árbol</label>
                <input
                  id="methodSearch"
                  type="search"
                  value={methodSearch}
                  onChange={(event) => setMethodSearch(event.target.value)}
                  placeholder="Resalta método, requisito o link..."
                />
              </div>
              <div className="status-legend" aria-label="Colores por estado">
                {STATUS.map((status) => (
                  <span key={status} data-status={status}>
                    {status}
                  </span>
                ))}
              </div>
            </div>

            <TreeGraph
              rootMethods={rootMethods}
              childrenMap={childrenMap}
              searchMatchIds={searchMatchIds}
              searchQuery={methodSearch}
              selectedMethodId={selectedMethodId}
              onSelectMethod={setSelectedMethodId}
            />
          </section>

          <section className="detail-panel">
            {!selectedMethod && (
              <div className="detail-empty">
                <p className="eyebrow">Detalle</p>
                <h3>Selecciona un método</h3>
                <p>Al elegir un nodo del árbol podrás editar sus requisitos, links, imágenes y submetodos.</p>
              </div>
            )}

            {selectedMethod && (
              <article className="method-detail">
                <header className="detail-header">
                  <div>
                    <p className="eyebrow">
                      {getMethodPath(selectedMethods, selectedMethod.id)
                        .map((method) => method.name)
                        .join(" / ")}
                    </p>
                    <h3>{selectedMethod.name}</h3>
                  </div>
                  <button className="icon-button danger" type="button" onClick={handleDeleteMethod} title="Eliminar método">
                    ×
                  </button>
                </header>

                <form className="edit-form" onSubmit={handleSaveMethod}>
                  <div>
                    <label htmlFor="methodName">Nombre</label>
                    <input
                      id="methodName"
                      type="text"
                      value={methodDraft.name}
                      onChange={(event) => setMethodDraft((draft) => ({ ...draft, name: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="methodStatus">Estado</label>
                    <select
                      id="methodStatus"
                      value={methodDraft.status}
                      onChange={(event) => setMethodDraft((draft) => ({ ...draft, status: event.target.value }))}
                    >
                      {STATUS.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div className="wide">
                    <label htmlFor="methodRequirement">Requisito / alcance</label>
                    <textarea
                      id="methodRequirement"
                      value={methodDraft.requirement}
                      onChange={(event) => setMethodDraft((draft) => ({ ...draft, requirement: event.target.value }))}
                      placeholder="Qué debe cumplir este método"
                    />
                  </div>
                  <div className="wide">
                    <label htmlFor="methodNotes">Notas</label>
                    <textarea
                      id="methodNotes"
                      value={methodDraft.notes}
                      onChange={(event) => setMethodDraft((draft) => ({ ...draft, notes: event.target.value }))}
                      placeholder="Criterios, pendientes o decisiones"
                    />
                  </div>
                  <button type="submit">Guardar método</button>
                </form>

                <section className="asset-section">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Dependencias</p>
                      <h4>Submétodos directos</h4>
                    </div>
                  </div>
                  <form
                    className="child-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleCreateChild(singleChildName);
                      setSingleChildName("");
                    }}
                  >
                    <input
                      type="text"
                      value={singleChildName}
                      onChange={(event) => setSingleChildName(event.target.value)}
                      placeholder="Ej. Get Client"
                      autoComplete="off"
                      required
                    />
                    <button type="submit">Agregar</button>
                  </form>
                  <div className="bulk-child-box">
                    <label htmlFor="bulkChildren">Agregar varios submetodos</label>
                    <textarea
                      id="bulkChildren"
                      value={bulkChildren}
                      onChange={(event) => setBulkChildren(event.target.value)}
                      placeholder={"Get Client\nGet Document"}
                    />
                    <button className="ghost-button" type="button" onClick={handleCreateBulkChildren}>
                      Agregar lista
                    </button>
                  </div>
                  <ul className="child-method-list">
                    {directChildren.length === 0 && (
                      <li className="empty-list">Aún no hay submetodos directos para este método.</li>
                    )}
                    {directChildren.map((child) => (
                      <li className="child-method-item" key={child.id}>
                        <div>
                          <strong>{child.name}</strong>
                          <span className="status-pill" data-status={child.status}>
                            {child.status}
                          </span>
                        </div>
                        <button className="ghost-button" type="button" onClick={() => setSelectedMethodId(child.id)}>
                          Abrir
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="asset-section">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Evidencia visual</p>
                      <h4>Imágenes</h4>
                    </div>
                    <label className="ghost-button" htmlFor="imageInput">
                      Agregar
                    </label>
                    <input
                      id="imageInput"
                      className="visually-hidden"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => {
                        handleAddImages(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </div>
                  <div className="image-grid">
                    {selectedMethod.images.length === 0 && (
                      <p className="empty-list">Aún no hay imágenes para este método.</p>
                    )}
                    {selectedMethod.images.map((image) => (
                      <article className="image-card" key={image.id}>
                        <img src={image.src} alt={image.name} />
                        <footer>
                          <span>{image.name}</span>
                          <button className="ghost-button danger" type="button" onClick={() => handleDeleteImage(image.id)}>
                            Quitar
                          </button>
                        </footer>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="asset-section">
                  <div className="section-header compact">
                    <div>
                      <p className="eyebrow">Referencias</p>
                      <h4>Links</h4>
                    </div>
                  </div>
                  <form className="link-form" onSubmit={handleAddLink}>
                    <input
                      type="text"
                      value={linkTitle}
                      onChange={(event) => setLinkTitle(event.target.value)}
                      placeholder="Título"
                      autoComplete="off"
                    />
                    <input
                      type="text"
                      inputMode="url"
                      value={linkUrl}
                      onChange={(event) => setLinkUrl(event.target.value)}
                      placeholder="https://..."
                      autoComplete="off"
                      required
                    />
                    <button type="submit">Agregar</button>
                  </form>
                  <ul className="link-list">
                    {selectedMethod.links.length === 0 && <li className="empty-list">Aún no hay links.</li>}
                    {selectedMethod.links.map((link) => (
                      <li className="link-item" key={link.id}>
                        <div>
                          <a href={link.url} target="_blank" rel="noreferrer">
                            {link.title}
                          </a>
                          <span>{link.url}</span>
                        </div>
                        <button className="ghost-button danger" type="button" onClick={() => handleDeleteLink(link.id)}>
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              </article>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

function TreeGraph({ rootMethods, childrenMap, searchMatchIds, searchQuery, selectedMethodId, onSelectMethod }) {
  if (rootMethods.length === 0) {
    return (
      <div className="tree-empty">
        Crea un método principal o usa el ejemplo Execute para generar el primer árbol.
      </div>
    );
  }

  return (
    <div className="tree-canvas" aria-label="Árbol gráfico de dependencias">
      {rootMethods.map((method) => (
        <TreeBranch
          key={method.id}
          method={method}
          childrenMap={childrenMap}
          searchMatchIds={searchMatchIds}
          searchQuery={searchQuery}
          selectedMethodId={selectedMethodId}
          onSelectMethod={onSelectMethod}
          depth={0}
        />
      ))}
    </div>
  );
}

function TreeBranch({ method, childrenMap, searchMatchIds, searchQuery, selectedMethodId, onSelectMethod, depth }) {
  const children = childrenMap.get(method.id) ?? [];
  const isSearchActive = Boolean(searchQuery.trim());
  const isSearchMatch = searchMatchIds.has(method.id);

  return (
    <div className="tree-branch">
      <button
        type="button"
        className={[
          "graph-node",
          method.id === selectedMethodId ? "active" : "",
          isSearchActive && isSearchMatch ? "search-match" : "",
          isSearchActive && !isSearchMatch ? "search-muted" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        data-status={method.status}
        onClick={() => onSelectMethod(method.id)}
      >
        <span className="node-kind">{depth === 0 ? "Principal" : "Submétodo"}</span>
        <strong>{method.name}</strong>
        <span className="status-pill" data-status={method.status}>
          {method.status}
        </span>
        <small>{children.length} dependencia(s)</small>
      </button>

      {children.length > 0 && (
        <div className="tree-children">
          {children.map((child) => (
            <div className="tree-child-wrap" key={child.id}>
              <TreeBranch
                method={child}
                childrenMap={childrenMap}
                searchMatchIds={searchMatchIds}
                searchQuery={searchQuery}
                selectedMethodId={selectedMethodId}
                onSelectMethod={onSelectMethod}
                depth={depth + 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
