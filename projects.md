---
layout: default
permalink: /projects/
---

## My Projects

{% for project in site.data.projects %}
{% if project.hide %}{% continue %}{% endif %}
<div class="row">
<h3>The {% if project.full_name %}  {{project.full_name}} {% else %} {{project.name}} {% endif %} Project</h3>
{% if project.logo %}
  <div class="left">
  <img src="/assets/img/project_logos/{{project.logo}}" alt="Project logo for {{project.name}}" width="150" >
  </div>
{% endif %}
<div class="right">
  <p>{{project.blurb}}</p> {% if project.more %}<p><i class="fa-solid fa-dna"></i><a href="{{ project.more }}">more about {{project.name}}</a></p>{% endif %}
  </div>
</div>
{% endfor %}

## RAPT Lab
I direct the Representations, Activity, Play and Technology (RAPT) Lab, and do most of this work in collaboration with my team. You can see more about the lab at  <a href="http://theraptlab.org" target="_blank">RAPTLab.org</a>